// ============================================
// SHIPPING_SIMPLE.JS - VERSÃO COMPLETA V4.6
// SISTEMA DE RECLAMAÇÕES DE FRETE - CORREÇÃO FULL E EXPORTAÇÕES
// ============================================

console.log('🚚 shipping_simple.js v4.6 carregado - Sistema completo de reclamações de frete');

if (typeof window.WORKER_URL === 'undefined') {
    window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
}

// ============================================
// TABELA DE CUSTOS DE FRETE
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

// A tabela acima é a versão-base.
// Ela será usada nas vendas anteriores à primeira atualização cadastrada.
let tabelasFreteHistoricas = [];

function normalizarDataVendaFrete(data) {
    if (!data) {
        return null;
    }

    const objeto = new Date(data);

    if (isNaN(objeto.getTime())) {
        return null;
    }

    return objeto;
}

function obterTabelaFreteVigente(dataVenda) {
    const data = normalizarDataVendaFrete(dataVenda);

    if (
        !data ||
        tabelasFreteHistoricas.length === 0
    ) {
        return SHIPPING_COST_TABLE;
    }

    const tabelasVigentes =
        tabelasFreteHistoricas
            .filter(item => {
                const inicio = new Date(
                    `${item.vigencia_inicio}T00:00:00`
                );

                return (
                    !isNaN(inicio.getTime()) &&
                    inicio <= data
                );
            })
            .sort((a, b) =>
                String(b.vigencia_inicio)
                    .localeCompare(
                        String(a.vigencia_inicio)
                    )
            );

    if (
        tabelasVigentes.length === 0 ||
        !Array.isArray(
            tabelasVigentes[0].tabela
        )
    ) {
        return SHIPPING_COST_TABLE;
    }

    return tabelasVigentes[0].tabela;
}

async function carregarTabelasFreteHistoricas() {
    if (!window.supabaseClient) {
        return;
    }

    const {
        data,
        error
    } = await window.supabaseClient
        .from('tabelas_frete_ml')
        .select('*')
        .order(
            'vigencia_inicio',
            { ascending: false }
        );

    if (error) {
        console.error(
            'Erro ao carregar tabelas históricas de frete:',
            error
        );

        const lista =
            document.getElementById(
                'historicoTabelasFrete'
            );

        if (lista) {
            lista.innerHTML = `
                <div class="alert alert-warning mb-0">
                    A tabela tabelas_frete_ml ainda não
                    foi criada no Supabase.
                </div>
            `;
        }

        return;
    }

    tabelasFreteHistoricas =
        (data || [])
            .map(item => {
                let tabela = item.tabela;

                if (typeof tabela === 'string') {
                    try {
                        tabela = JSON.parse(tabela);
                    } catch (error) {
                        tabela = [];
                    }
                }

                return {
                    ...item,
                    tabela:
                        Array.isArray(tabela)
                            ? tabela
                            : []
                };
            })
            .filter(item =>
                item.tabela.length > 0
            );

    renderizarHistoricoTabelasFrete();
}

function renderizarHistoricoTabelasFrete() {
    const container =
        document.getElementById(
            'historicoTabelasFrete'
        );

    if (!container) {
        return;
    }

    if (
        tabelasFreteHistoricas.length === 0
    ) {
        container.innerHTML = `
            <span class="text-muted">
                Nenhuma atualização cadastrada.
                A tabela original do sistema está vigente.
            </span>
        `;

        return;
    }

    container.innerHTML =
        tabelasFreteHistoricas
            .map(item => {
                const data = new Date(
                    `${item.vigencia_inicio}T00:00:00`
                ).toLocaleDateString('pt-BR');

                const quantidade =
                    Array.isArray(item.tabela)
                        ? item.tabela.length
                        : 0;

                return `
                    <div
                        class="d-flex justify-content-between
                               align-items-center border-top py-2"
                    >
                        <div>
                            <strong>
                                A partir de ${data}
                            </strong>

                            <br>

                            <small class="text-muted">
                                ${quantidade} faixas
                                •
                                ${
                                    item.link_origem ||
                                    'Link não informado'
                                }
                            </small>
                        </div>

                        <span class="badge badge-success">
                            Salva
                        </span>
                    </div>
                `;
            })
            .join('');
}

function numeroBrasileiroFrete(texto) {
    const limpo =
        String(texto || '')
            .replace(/R\$/gi, '')
            .replace(/\s/g, '')
            .replace(
                /\.(?=\d{3}(?:\D|$))/g,
                ''
            )
            .replace(',', '.');

    const numero = parseFloat(
        limpo.replace(
            /[^0-9.-]/g,
            ''
        )
    );

    return isNaN(numero)
        ? null
        : numero;
}

function extrairIntervaloPrecoFrete(texto) {
    const original =
        String(texto || '');

    const numeros =
        original.match(
            /\d[\d.]*,?\d*/g
        ) || [];

    const valores =
        numeros
            .map(numeroBrasileiroFrete)
            .filter(valor =>
                valor !== null
            );

    if (!valores.length) {
        return null;
    }

    if (
        /(at[eé]|menos de)/i.test(original) &&
        valores.length === 1
    ) {
        return {
            min: 0,
            max: valores[0]
        };
    }

    if (
        /(ou mais|acima|maior|a partir de)/i
            .test(original) &&
        valores.length === 1
    ) {
        return {
            min: valores[0],
            max: 1000000
        };
    }

    if (valores.length >= 2) {
        return {
            min: valores[0],
            max: valores[1]
        };
    }

    return null;
}

function extrairIntervaloPesoFrete(texto) {
    const original =
        String(texto || '')
            .toLowerCase();

    const numeros =
        original.match(
            /\d[\d.]*,?\d*/g
        ) || [];

    let valores =
        numeros
            .map(numeroBrasileiroFrete)
            .filter(valor =>
                valor !== null
            );

    if (!valores.length) {
        return null;
    }

    const usaGramas =
        /\bg\b/i.test(original) &&
        !/\bkg\b/i.test(original);

    if (usaGramas) {
        valores =
            valores.map(valor =>
                valor / 1000
            );
    }

    if (
        /(at[eé]|menos de)/i.test(original) &&
        valores.length === 1
    ) {
        return {
            min: 0,
            max: valores[0]
        };
    }

    if (
        /(ou mais|acima|maior|a partir de)/i
            .test(original) &&
        valores.length === 1
    ) {
        return {
            min: valores[0],
            max: 1000
        };
    }

    if (valores.length >= 2) {
        return {
            min: valores[0],
            max: valores[1]
        };
    }

    return null;
}

function decodificarHTMLTabelaFrete(conteudo) {
    const area =
        document.createElement('textarea');

    area.innerHTML =
        String(conteudo || '');

    return area.value
        .replace(/\\u003c/gi, '<')
        .replace(/\\u003e/gi, '>')
        .replace(/\\u0026/gi, '&')
        .replace(/\\u0022/gi, '"')
        .replace(/\\\//g, '/')
        .replace(/\\"/g, '"');
}

function coletarConteudosPossiveisTabelaFrete(
    html
) {
    const conteudos = [
        String(html || '')
    ];

    const documento =
        new DOMParser().parseFromString(
            String(html || ''),
            'text/html'
        );

    // Procura os dados dentro dos scripts da página.
    documento
        .querySelectorAll('script')
        .forEach(script => {
            const texto =
                script.textContent || '';

            if (texto) {
                conteudos.push(texto);
            }

            // Algumas páginas guardam todo o conteúdo
            // dentro de um objeto JSON.
            try {
                const json =
                    JSON.parse(texto);

                const percorrer = valor => {
                    if (
                        typeof valor ===
                        'string'
                    ) {
                        if (
                            /peso|R\$|table|custos? d[oe] envio/i
                                .test(valor)
                        ) {
                            conteudos.push(
                                valor
                            );
                        }

                        return;
                    }

                    if (
                        Array.isArray(valor)
                    ) {
                        valor.forEach(
                            percorrer
                        );

                        return;
                    }

                    if (
                        valor &&
                        typeof valor ===
                            'object'
                    ) {
                        Object
                            .values(valor)
                            .forEach(
                                percorrer
                            );
                    }
                };

                percorrer(json);

            } catch (error) {
                // O script não era um JSON.
            }
        });

    // Procura HTML escapado no código bruto.
    const brutoDecodificado =
        decodificarHTMLTabelaFrete(
            html
        );

    conteudos.push(
        brutoDecodificado
    );

    const blocosEscapados =
        String(html || '').match(
            /(?:<table|&lt;table|\\u003ctable)[\s\S]*?(?:<\\\/table>|<\/table>|&lt;\\?\/table&gt;|\\u003c\\?\/table\\u003e)/gi
        ) || [];

    blocosEscapados.forEach(
        bloco => {
            conteudos.push(
                decodificarHTMLTabelaFrete(
                    bloco
                )
            );
        }
    );

    // Remove conteúdos repetidos.
    return [
        ...new Set(
            conteudos
                .map(
                    decodificarHTMLTabelaFrete
                )
                .filter(Boolean)
        )
    ];
}

function decodificarHTMLTabelaFrete(conteudo) {
    const area =
        document.createElement('textarea');

    area.innerHTML =
        String(conteudo || '');

    return area.value
        .replace(/\\u003c/gi, '<')
        .replace(/\\u003e/gi, '>')
        .replace(/\\u0026/gi, '&')
        .replace(/\\u0022/gi, '"')
        .replace(/\\\//g, '/')
        .replace(/\\"/g, '"');
}

function coletarConteudosPossiveisTabelaFrete(
    html
) {
    const conteudos = [
        String(html || '')
    ];

    const documento =
        new DOMParser().parseFromString(
            String(html || ''),
            'text/html'
        );

    // Procura os dados dentro dos scripts da página.
    documento
        .querySelectorAll('script')
        .forEach(script => {
            const texto =
                script.textContent || '';

            if (texto) {
                conteudos.push(texto);
            }

            // Algumas páginas guardam todo o conteúdo
            // dentro de um objeto JSON.
            try {
                const json =
                    JSON.parse(texto);

                const percorrer = valor => {
                    if (
                        typeof valor ===
                        'string'
                    ) {
                        if (
                            /peso|R\$|table|custos? d[oe] envio/i
                                .test(valor)
                        ) {
                            conteudos.push(
                                valor
                            );
                        }

                        return;
                    }

                    if (
                        Array.isArray(valor)
                    ) {
                        valor.forEach(
                            percorrer
                        );

                        return;
                    }

                    if (
                        valor &&
                        typeof valor ===
                            'object'
                    ) {
                        Object
                            .values(valor)
                            .forEach(
                                percorrer
                            );
                    }
                };

                percorrer(json);

            } catch (error) {
                // O script não era um JSON.
            }
        });

    // Procura HTML escapado no código bruto.
    const brutoDecodificado =
        decodificarHTMLTabelaFrete(
            html
        );

    conteudos.push(
        brutoDecodificado
    );

    const blocosEscapados =
        String(html || '').match(
            /(?:<table|&lt;table|\\u003ctable)[\s\S]*?(?:<\\\/table>|<\/table>|&lt;\\?\/table&gt;|\\u003c\\?\/table\\u003e)/gi
        ) || [];

    blocosEscapados.forEach(
        bloco => {
            conteudos.push(
                decodificarHTMLTabelaFrete(
                    bloco
                )
            );
        }
    );

    // Remove conteúdos repetidos.
    return [
        ...new Set(
            conteudos
                .map(
                    decodificarHTMLTabelaFrete
                )
                .filter(Boolean)
        )
    ];
}

function extrairTabelaFreteDoHTML(html) {
    let melhorResultado = [];

    const conteudos =
        coletarConteudosPossiveisTabelaFrete(
            html
        );

    conteudos.forEach(conteudo => {
        const documento =
            new DOMParser().parseFromString(
                conteudo,
                'text/html'
            );

        const tabelas = [
            ...documento.querySelectorAll(
                'table'
            )
        ];

        tabelas.forEach(tabela => {
            const linhas = [
                ...tabela.querySelectorAll(
                    'tr'
                )
            ]
                .map(linha =>
                    [
                        ...linha.querySelectorAll(
                            'th, td'
                        )
                    ].map(celula =>
                        celula.textContent
                            .replace(
                                /\s+/g,
                                ' '
                            )
                            .trim()
                    )
                )
                .filter(linha =>
                    linha.length > 1
                );

            if (linhas.length < 2) {
                return;
            }

            /*
             * Procura a linha que contém:
             *
             * Peso
             * R$ 0 a R$ 18,99
             * R$ 19 a R$ 48,99
             * R$ 49 a R$ 78,99
             * etc.
             */

            let indiceCabecalho = -1;
            let precos = [];

            for (
                let indice = 0;
                indice < linhas.length;
                indice++
            ) {
                const candidatos =
                    linhas[indice]
                        .slice(1)
                        .map(
                            extrairIntervaloPrecoFrete
                        );

                const quantidadeValida =
                    candidatos.filter(
                        Boolean
                    ).length;

                if (
                    quantidadeValida >= 2
                ) {
                    indiceCabecalho =
                        indice;

                    precos =
                        candidatos;

                    break;
                }
            }

            if (
                indiceCabecalho < 0 ||
                precos.filter(Boolean)
                    .length < 2
            ) {
                return;
            }

            const resultado = [];

            linhas
                .slice(
                    indiceCabecalho + 1
                )
                .forEach(linha => {
                    const peso =
                        extrairIntervaloPesoFrete(
                            linha[0]
                        );

                    if (!peso) {
                        return;
                    }

                    precos.forEach(
                        (
                            preco,
                            indice
                        ) => {
                            if (!preco) {
                                return;
                            }

                            const textoCusto =
                                linha[
                                    indice + 1
                                ];

                            const custo =
                                numeroBrasileiroFrete(
                                    textoCusto
                                );

                            if (
                                custo === null ||
                                custo < 0
                            ) {
                                return;
                            }

                            resultado.push({
                                priceMin:
                                    preco.min,

                                priceMax:
                                    preco.max,

                                weightMin:
                                    peso.min,

                                weightMax:
                                    peso.max,

                                cost:
                                    custo
                            });
                        }
                    );
                });

            if (
                resultado.length >
                melhorResultado.length
            ) {
                melhorResultado =
                    resultado;
            }
        });
    });

    if (
        melhorResultado.length < 4
    ) {
        const conteudoDecodificado =
            decodificarHTMLTabelaFrete(
                html
            );

        const temReferenciaTabela =
            /peso|R\$\s*0\s*a\s*R\$|custos? d[oe] envios?/i
                .test(
                    conteudoDecodificado
                );

        if (!temReferenciaTabela) {
            throw new Error(
                'O Mercado Livre não enviou os ' +
                'dados da tabela para o sistema. ' +
                'O link abre no navegador, mas ' +
                'o conteúdo exige a sessão ' +
                'autenticada da página.'
            );
        }

        throw new Error(
            'Os dados chegaram, mas nenhuma ' +
            'grade completa de peso, preço e ' +
            'custo foi encontrada.'
        );
    }

    console.log(
        `✅ Tabela identificada com ` +
        `${melhorResultado.length} faixas.`
    );

    return melhorResultado;
}

async function buscarHTMLTabelaFrete(link) {
    let url;

    try {
        url = new URL(link);
    } catch (error) {
        throw new Error(
            'O link informado não é válido.'
        );
    }

    const hostPermitido =
        url.hostname ===
            'mercadolivre.com.br' ||

        url.hostname.endsWith(
            '.mercadolivre.com.br'
        ) ||

        url.hostname ===
            'mercadolibre.com' ||

        url.hostname.endsWith(
            '.mercadolibre.com'
        );

    if (
        url.protocol !== 'https:' ||
        !hostPermitido
    ) {
        throw new Error(
            'Informe um link HTTPS oficial ' +
            'do Mercado Livre.'
        );
    }

    // Primeira tentativa: acesso direto.
    try {
        const respostaDireta =
            await fetch(
                url.href,
                {
                    credentials:
                        'include'
                }
            );

        if (respostaDireta.ok) {
            return await respostaDireta.text();
        }
    } catch (error) {
        console.warn(
            'Acesso direto ao link bloqueado. ' +
            'Tentando pelo proxy.'
        );
    }

    // Segunda tentativa: proxy já usado pelo sistema.
    let token =
        window.mlTokenStatus
            ?.access_token ||
        null;

    if (
        !token &&
        typeof window.getValidToken ===
            'function'
    ) {
        const tokenData =
            await window.getValidToken();

        token =
            tokenData?.access_token ||
            null;
    }

    if (!token) {
        token =
            localStorage.getItem(
                'ml_access_token'
            );
    }

    if (!token) {
        throw new Error(
            'Token do Mercado Livre ' +
            'não disponível.'
        );
    }

    const proxy =
        `${window.WORKER_URL}/api/ml/proxy` +
        `?url=${encodeURIComponent(url.href)}` +
        `&token=${encodeURIComponent(token)}`;

    const resposta =
        await fetch(proxy);

    if (!resposta.ok) {
        throw new Error(
            'O Mercado Livre não liberou ' +
            'a leitura do link. HTTP ' +
            resposta.status
        );
    }

    return await resposta.text();
}

function extrairTabelaFreteDoTextoCopiado(texto) {
    const linhas = String(texto || '')
        .replace(/\r/g, '')
        .split('\n')
        .map(linha => linha.trim())
        .filter(Boolean);

    let indiceCabecalho = -1;
    let cabecalho = [];

    for (let i = 0; i < linhas.length; i++) {
        let colunas = linhas[i]
            .split('\t')
            .map(celula => celula.trim())
            .filter(Boolean);

        if (colunas.length < 3) {
            colunas = linhas[i]
                .split(/\s{2,}/)
                .map(celula => celula.trim())
                .filter(Boolean);
        }

        const faixasPreco = colunas
            .slice(1)
            .map(extrairIntervaloPrecoFrete);

        if (
            /peso/i.test(colunas[0] || '') &&
            faixasPreco.filter(Boolean).length >= 2
        ) {
            indiceCabecalho = i;
            cabecalho = colunas;
            break;
        }
    }

    if (indiceCabecalho < 0) {
        throw new Error(
            'Não encontrei a linha de cabeçalho. ' +
            'Copie a tabela começando pela célula “Peso”.'
        );
    }

    const precos = cabecalho
        .slice(1)
        .map(extrairIntervaloPrecoFrete);

    const resultado = [];

    for (
        let i = indiceCabecalho + 1;
        i < linhas.length;
        i++
    ) {
        let colunas = linhas[i]
            .split('\t')
            .map(celula => celula.trim());

        if (colunas.length < 3) {
            colunas = linhas[i]
                .split(/\s{2,}/)
                .map(celula => celula.trim())
                .filter(Boolean);
        }

        const peso = extrairIntervaloPesoFrete(
            colunas[0]
        );

        if (!peso) {
            continue;
        }

        precos.forEach((preco, indice) => {
            if (!preco) {
                return;
            }

            const custo = numeroBrasileiroFrete(
                colunas[indice + 1]
            );

            if (
                custo === null ||
                custo < 0
            ) {
                return;
            }

            resultado.push({
                priceMin: preco.min,
                priceMax: preco.max,
                weightMin: peso.min,
                weightMax: peso.max,
                cost: custo
            });
        });
    }

    if (resultado.length < 4) {
        throw new Error(
            'A tabela colada não contém faixas suficientes. ' +
            'Selecione e copie todas as colunas e linhas ' +
            'da tabela do Mercado Livre.'
        );
    }

    console.log(
        `✅ ${resultado.length} faixas importadas ` +
        `da tabela copiada.`
    );

    return resultado;
}

async function salvarNovaTabelaFrete() {
    const dataInput = document.getElementById('dataInicioNovaTabelaFrete');
    const textoInput = document.getElementById('textoNovaTabelaFrete');
    const botao = document.getElementById('btnImportarTabelaFrete');

    const vigencia = dataInput?.value;
    const textoTabela = textoInput?.value.trim();

    if (!vigencia) {
        showToast('Informe a data inicial da nova tabela.', 'warning');
        return;
    }

    if (!textoTabela) {
        showToast(
            'Copie a tabela completa e cole no campo “Tabela copiada do Mercado Livre”.',
            'warning'
        );
        return;
    }

    try {
        if (botao) {
            botao.disabled = true;
            botao.innerHTML =
                '<span class="spinner"></span> Processando tabela...';
        }

        const tabela = extrairTabelaFreteDoTextoCopiado(textoTabela);

        const { error } = await window.supabaseClient
            .from('tabelas_frete_ml')
            .upsert(
                {
                    vigencia_inicio: vigencia,
                    link_origem: 'Tabela colada manualmente',
                    tabela,
                    criado_por: getNomeUsuario(),
                    atualizado_em: new Date().toISOString()
                },
                {
                    onConflict: 'vigencia_inicio'
                }
            );

        if (error) {
            throw error;
        }

        await carregarTabelasFreteHistoricas();
        await carregarFretesSalvos();

        if (textoInput) {
            textoInput.value = '';
        }

        const dataFormatada = new Date(
            `${vigencia}T00:00:00`
        ).toLocaleDateString('pt-BR');

        showToast(
            `Tabela salva com ${tabela.length} faixas. ` +
            `Válida a partir de ${dataFormatada}.`,
            'success'
        );
    } catch (error) {
        console.error('Erro ao importar tabela de frete:', error);

        showToast(
            `Não foi possível importar: ${error.message}`,
            'error'
        );
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.innerHTML =
                '<i class="fas fa-save"></i> Processar e salvar tabela';
        }
    }
}

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let filtroStatusReclamacao = 'todos';
let reclamacoesCache = [];
let protocolosTemp = [];
let currentReclamacaoId = null;

let fretesPaginaAtual = 1;
let fretesPorPagina = 20;
let fretesDadosCompletos = [];
let fretesFiltrados = [];
let termoBuscaFretes = '';

// ============================================
// DIMENSÕES PADRÃO (22x16x1cm)
// ============================================
const DEFAULT_DIMENSIONS = {
    comprimento: 22,
    largura: 16,
    altura: 1
};


// ============================================
// FUNÇÃO PARA DETECTAR VENDAS FULL (VERSÃO COMPLETA)
// ============================================
function isFullByAnyField(item) {
    // 1. Verificar tipo_envio
    const tipoEnvio = (item.tipo_envio || '').toUpperCase();
    if (tipoEnvio.includes('FULL') || 
        tipoEnvio.includes('FULFILLMENT') || 
        tipoEnvio === 'FULL') {
        console.log(`🔍 FULL detectado por tipo_envio: ${tipoEnvio}`);
        return true;
    }
    
    // 2. Verificar informacoes_envio (dados do shipment)
    if (item.informacoes_envio) {
        try {
            const infoEnvio = typeof item.informacoes_envio === 'string' 
                ? JSON.parse(item.informacoes_envio) 
                : item.informacoes_envio;
            
            // Verificar logistic_type
            const logisticType = (infoEnvio.logistic_type || '').toUpperCase();
            if (logisticType.includes('FULL') || 
                logisticType.includes('FULFILLMENT') || 
                logisticType === 'FULL') {
                console.log(`🔍 FULL detectado por logistic_type: ${logisticType}`);
                return true;
            }
            
            // Verificar mode
            const mode = (infoEnvio.mode || '').toUpperCase();
            if (mode.includes('FULL') || mode.includes('FULFILLMENT')) {
                console.log(`🔍 FULL detectado por mode: ${mode}`);
                return true;
            }
            
            // Verificar tipo
            const tipo = (infoEnvio.tipo || '').toUpperCase();
            if (tipo.includes('FULL') || tipo.includes('FULFILLMENT')) {
                console.log(`🔍 FULL detectado por tipo: ${tipo}`);
                return true;
            }
            
            // Verificar fulfillment
            const fulfillment = (infoEnvio.fulfillment || '').toUpperCase();
            if (fulfillment.includes('FULL') || fulfillment.includes('FULFILLMENT')) {
                console.log(`🔍 FULL detectado por fulfillment: ${fulfillment}`);
                return true;
            }
            
            // Verificar tags do shipment
            if (infoEnvio.tags && Array.isArray(infoEnvio.tags)) {
                const tags = infoEnvio.tags.map(t => String(t).toUpperCase());
                if (tags.some(t => t.includes('FULL') || t.includes('FULFILLMENT'))) {
                    console.log(`🔍 FULL detectado por tags: ${tags.join(', ')}`);
                    return true;
                }
            }
        } catch (e) {
            // Se falhar ao parsear, ignora
        }
    }
    
    // 3. Verificar tags da venda
    if (item.tags && Array.isArray(item.tags)) {
        const tags = item.tags.map(t => String(t).toUpperCase());
        if (tags.some(t => t.includes('FULL') || t.includes('FULFILLMENT'))) {
            console.log(`🔍 FULL detectado por tags da venda: ${tags.join(', ')}`);
            return true;
        }
    }
    
    // 4. Verificar campos adicionais
    const searchFields = [
        item.titulo || '',
        item.mlb || '',
        item.id || '',
        item.sku || '',
        item.shipping_mode || '',
        item.tipo_entrega || '',
        item.logistic_type || ''
    ];
    
    const fullKeywords = ['full', 'fulfillment', 'fulfilment'];
    for (const field of searchFields) {
        const fieldLower = String(field).toLowerCase();
        if (fullKeywords.some(keyword => fieldLower.includes(keyword))) {
            console.log(`🔍 FULL detectado por campo: ${field.substring(0, 30)}...`);
            return true;
        }
    }
    
    return false;
}

function calcularFretePagoPeloVendedor(dadosEnvio) {
    if (!dadosEnvio) {
        return 0;
    }

    let info = dadosEnvio;

    /*
     * Pode vir do Supabase como JSON string.
     */
    if (typeof info === 'string') {
        try {
            info = JSON.parse(info);
        } catch (e) {
            console.warn(
                '⚠️ Não foi possível interpretar informacoes_envio:',
                info
            );

            return 0;
        }
    }

    const opcao =
        info?.shipping_option &&
        typeof info.shipping_option === 'object'
            ? info.shipping_option
            : {};

    /*
     * Converte corretamente:
     *
     * 22.94
     * "22.94"
     * "22,94"
     * "R$ 22,94"
     */
    const converterNumeroFrete = valor => {
        if (
            valor === null ||
            valor === undefined ||
            valor === ''
        ) {
            return null;
        }

        if (typeof valor === 'number') {
            return Number.isFinite(valor)
                ? valor
                : null;
        }

        let texto = String(valor)
            .replace(/R\$/gi, '')
            .replace(/\s/g, '')
            .trim();

        /*
         * Se tiver ponto e vírgula:
         * 1.234,56
         */
        if (
            texto.includes('.') &&
            texto.includes(',')
        ) {
            if (
                texto.lastIndexOf(',') >
                texto.lastIndexOf('.')
            ) {
                texto =
                    texto
                        .replace(/\./g, '')
                        .replace(',', '.');
            } else {
                texto =
                    texto.replace(/,/g, '');
            }

        } else if (
            texto.includes(',')
        ) {
            /*
             * 22,94
             */
            texto =
                texto.replace(',', '.');
        }

        const numero =
            parseFloat(
                texto.replace(
                    /[^0-9.-]/g,
                    ''
                )
            );

        return Number.isFinite(numero)
            ? numero
            : null;
    };

    /*
     * =====================================================
     * PARTE PAGA PELO COMPRADOR
     * =====================================================
     *
     * IMPORTANTE:
     *
     * Não usamos:
     *
     * info.receiver_cost ?? opcao.receiver_cost
     *
     * porque o primeiro pode vir como 0
     * enquanto o segundo contém 15,99.
     */

    const valoresComprador = [
        converterNumeroFrete(
            info.receiver_cost
        ),

        converterNumeroFrete(
            opcao.receiver_cost
        )
    ].filter(
        valor =>
            valor !== null &&
            valor > 0
    );

    const pagoPeloComprador =
        valoresComprador.length
            ? Math.max(
                ...valoresComprador
            )
            : 0;

    /*
     * =====================================================
     * VALORES DE TARIFA QUE O ML ENVIOU
     * =====================================================
     *
     * Pode acontecer de:
     *
     * list_cost = 22,94
     * cost = 6,95
     *
     * OU:
     *
     * cost = 22,94
     * receiver_cost = 15,99
     *
     * Então analisamos todos.
     */

    const valoresTarifa = [
        converterNumeroFrete(
            info.list_cost
        ),

        converterNumeroFrete(
            opcao.list_cost
        ),

        converterNumeroFrete(
            info.cost
        ),

        converterNumeroFrete(
            opcao.cost
        )
    ].filter(
        valor =>
            valor !== null &&
            valor > 0
    );

    if (
        valoresTarifa.length === 0
    ) {
        console.warn(
            '⚠️ Nenhum custo de frete encontrado:',
            info
        );

        return 0;
    }

    /*
     * Se temos:
     *
     * 22,94
     * 6,95
     *
     * pegamos 22,94 como tarifa cheia.
     */
    const maiorTarifa =
        Math.max(
            ...valoresTarifa
        );

    let custoEmpresa;

    /*
     * =====================================================
     * REGRA PRINCIPAL
     * =====================================================
     */

    if (
        pagoPeloComprador > 0 &&
        maiorTarifa >
            pagoPeloComprador
    ) {
        /*
         * Exemplo real:
         *
         * 22,94 - 15,99 = 6,95
         */
        custoEmpresa =
            maiorTarifa -
            pagoPeloComprador;

    } else {
        /*
         * Se o maior valor for menor que
         * o que o comprador pagou:
         *
         * cost = 6,95
         * receiver_cost = 15,99
         *
         * então cost já é o líquido
         * da empresa.
         */
        custoEmpresa =
            maiorTarifa;
    }

    custoEmpresa =
        Math.max(
            0,
            custoEmpresa
        );

    custoEmpresa =
        Number(
            custoEmpresa.toFixed(2)
        );

    console.log(
        '💰 ===== FRETE DA EMPRESA =====',
        {
            receiver_cost:
                info.receiver_cost,

            shipping_option_receiver_cost:
                opcao.receiver_cost,

            list_cost:
                info.list_cost,

            shipping_option_list_cost:
                opcao.list_cost,

            cost:
                info.cost,

            shipping_option_cost:
                opcao.cost,

            pagoPeloComprador:
                pagoPeloComprador,

            maiorTarifa:
                maiorTarifa,

            custoEmpresa:
                custoEmpresa,

            calculo:
                pagoPeloComprador > 0 &&
                maiorTarifa >
                    pagoPeloComprador

                    ? `${maiorTarifa} - ${pagoPeloComprador} = ${custoEmpresa}`

                    : `${custoEmpresa} já é o custo líquido`
        }
    );

    return custoEmpresa;
}

function normalizarFretePagoPeloVendedor(item) {
    const info = item?.informacoes_envio;

    if (!info) {
        return item;
    }

    const custoVendedor =
        calcularFretePagoPeloVendedor(info);

    if (custoVendedor <= 0) {
        return item;
    }

    return {
        ...item,
        frete_cobrado: custoVendedor,
        fonte_frete: 'custo líquido do vendedor'
    };
}

function obterTipoEnvio(item = {}, informacoesEnvio = null) {
    let info =
        informacoesEnvio ??
        item?.informacoes_envio ??
        {};

    if (typeof info === 'string') {
        try {
            info = JSON.parse(info);
        } catch (e) {
            info = {};
        }
    }

    const campos = [
        info?.logistic_type,
        info?.tipo,
        info?.mode,
        info?.fulfillment,
        item?.shipping?.logistic_type,
        item?.shipping?.mode,
        item?.shipping?.fulfillment,
        item?.logistic_type,
        item?.tipo_envio
    ].map(valor =>
        String(valor ?? '')
            .trim()
            .toLowerCase()
    );

    const tags = [
        ...(Array.isArray(info?.tags)
            ? info.tags
            : []),

        ...(Array.isArray(item?.tags)
            ? item.tags
            : []),

        ...(Array.isArray(item?.shipping?.tags)
            ? item.shipping.tags
            : [])
    ].map(tag =>
        String(tag)
            .trim()
            .toLowerCase()
    );

    const valores = [
        ...campos,
        ...tags
    ];

    const isFull = valores.some(valor =>
        valor.includes('full') ||
        valor.includes('fulfillment')
    );

    if (isFull) {
        return 'FULL';
    }

    const possuiEnvio = Boolean(
        info?.id ||
        item?.shipping?.id ||
        valores.some(valor =>
            valor &&
            valor !== 'n/i'
        )
    );

    return possuiEnvio ? 'ME' : 'N/I';
}

function renderizarBadgeTipoEnvio(item) {
    const tipo = obterTipoEnvio(item);

    if (tipo === 'FULL') {
        return `
            <span style="
                display:inline-flex;
                align-items:center;
                gap:4px;
                padding:3px 7px;
                border-radius:4px;
                background:#e83e5a;
                color:#fff;
                font-size:10px;
                font-weight:700;
                white-space:nowrap;
            ">
                <i class="fas fa-warehouse"></i>
                FULL
            </span>
        `;
    }

    if (tipo === 'ME') {
        return `
            <span style="
                display:inline-flex;
                align-items:center;
                gap:4px;
                padding:3px 7px;
                border-radius:4px;
                background:#17a2b8;
                color:#fff;
                font-size:10px;
                font-weight:700;
                white-space:nowrap;
            ">
                <i class="fas fa-truck"></i>
                ME
            </span>
        `;
    }

    return `
        <span style="
            display:inline-flex;
            align-items:center;
            padding:3px 7px;
            border-radius:4px;
            background:#6c757d;
            color:#fff;
            font-size:10px;
            font-weight:700;
            white-space:nowrap;
        ">
            N/I
        </span>
    `;
}

function calcularPesoVolumetrico(comprimento, largura, altura) {
    const cm3 = comprimento * largura * altura;
    return cm3 / 6000;
}

function getNomeUsuario() {
    if (window.currentUser && window.currentUser.name) {
        return window.currentUser.name;
    }
    try {
        const userData = localStorage.getItem('wheeltech_user');
        if (userData) {
            const user = JSON.parse(userData);
            if (user.name) return user.name;
        }
    } catch (e) {}
    return 'Sistema';
}

function formatarDataISO(dataISO) {
    if (!dataISO) return '-';
    const data = new Date(dataISO);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
}

function showToast(mensagem, tipo = 'info') {
    const toastExistente = document.querySelector('.custom-toast');
    if (toastExistente) toastExistente.remove();
    
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.style.cssText = `
        position: fixed; 
        bottom: 20px; 
        right: 20px; 
        padding: 12px 20px;
        background: ${tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : tipo === 'warning' ? '#ffc107' : '#17a2b8'};
        color: ${tipo === 'warning' ? '#212529' : 'white'};
        border-radius: 8px; 
        z-index: 99999; 
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        animation: slideIn 0.3s ease;
    `;
    toast.innerHTML = mensagem;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 4000);
}

// ============================================
// BUSCAR MEDIDAS SALVAS POR SKU (ATUALIZADO)
// ============================================
async function buscarMedidasPorSKU(sku) {
    if (!sku || sku === 'N/A' || sku === 'SEM SKU') return null;
    try {
        const { data, error } = await window.supabaseClient
            .from('produto_medidas')
            .select('*')
            .eq('sku', sku)
            .maybeSingle();
        if (error) throw error;
        return data;
    } catch (error) {
        console.warn(`Erro ao buscar medidas para SKU ${sku}:`, error.message);
        return null;
    }
}

// ============================================
// OBTER DIMENSÕES COM PADRÃO (22x16x1)
// ============================================
function obterDimensoesComPadrao(medidasSalvas) {
    if (medidasSalvas && medidasSalvas.comprimento_cm && medidasSalvas.largura_cm && medidasSalvas.altura_cm) {
        return {
            comprimento: medidasSalvas.comprimento_cm,
            largura: medidasSalvas.largura_cm,
            altura: medidasSalvas.altura_cm
        };
    }
    // Retorna o padrão 22x16x1
    return { ...DEFAULT_DIMENSIONS };
}

// ============================================
// SALVAR MEDIDAS POR SKU
// ============================================
async function salvarMedidasSKU(sku, comprimento, largura, altura, peso, fotoUrl = null) {
    if (!sku || sku === 'N/A' || sku === 'SEM SKU') {
        showToast('SKU inválido para salvar medidas', 'warning');
        return false;
    }

    try {
        const dados = {
            sku: sku,
            comprimento_cm: comprimento,
            largura_cm: largura,
            altura_cm: altura,
            peso_kg: peso,
            atualizado_em: new Date().toISOString()
        };
        if (fotoUrl) dados.foto_url = fotoUrl;

        const { data: existente } = await window.supabaseClient
            .from('produto_medidas')
            .select('sku')
            .eq('sku', sku)
            .maybeSingle();

        let result;
        if (existente) {
            result = await window.supabaseClient
                .from('produto_medidas')
                .update(dados)
                .eq('sku', sku);
        } else {
            dados.criado_em = new Date().toISOString();
            result = await window.supabaseClient
                .from('produto_medidas')
                .insert([dados]);
        }

        if (result.error) throw result.error;
        showToast(`Medidas salvas para SKU ${sku}`, 'success');
        return true;
    } catch (error) {
        console.error('Erro ao salvar medidas:', error);
        showToast('Erro ao salvar medidas: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// FUNÇÃO AUXILIAR: VERIFICAR SE SHIPMENT É FULL
// ============================================
async function isShipmentFULL(shipmentId, token) {
    try {
        const shipUrl = `https://api.mercadolibre.com/shipments/${shipmentId}`;
        const shipProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
        const shipResp = await fetch(shipProxy);
        if (shipResp.ok) {
            const shipData = await shipResp.json();
            const logisticType = shipData.logistic_type || '';
            const tags = shipData.tags || [];
            const shippingMode = shipData.mode || '';
            
            return logisticType.toLowerCase().includes('full') ||
                   logisticType.toLowerCase().includes('fulfillment') ||
                   tags.some(t => t.toLowerCase().includes('full')) ||
                   tags.some(t => t.toLowerCase().includes('fulfillment')) ||
                   shippingMode.toLowerCase().includes('full');
        }
        return false;
    } catch (e) {
        console.warn(`Erro ao verificar shipment ${shipmentId}:`, e.message);
        return false;
    }
}

// ============================================
// EXTRAIR FRETE DA VENDA - VERSÃO COMPLETA
// ============================================
async function extrairFreteDaVenda(order, token) {
    console.log(
        `🔍 Extraindo frete da venda ${order.id}...`
    );

    let resultado = {
        frete: 0,
        fonte: 'nenhuma',
        isFull: false,

        informacoesEnvio: {
            id: null,
            logistic_type: '',
            mode: '',
            fulfillment: '',
            tipo: '',
            receiver_cost: null,
            cost: null,
            list_cost: null,
            status: '',
            tags: []
        }
    };

    // ============================================
    // 1. BUSCAR DADOS COMPLETOS DO SHIPMENT
    // ============================================

    if (
        order.shipping &&
        order.shipping.id &&
        token
    ) {
        try {
            const shipUrl =
                `https://api.mercadolibre.com/shipments/${order.shipping.id}`;

            const shipProxy =
                `${window.WORKER_URL}/api/ml/proxy` +
                `?url=${encodeURIComponent(shipUrl)}` +
                `&token=${encodeURIComponent(token)}`;

            const shipResp = await fetch(shipProxy);

            if (shipResp.ok) {
                const shipData = await shipResp.json();

                console.log(
                    `📦 Shipment ${order.shipping.id}:`,
                    {
                        logistic_type:
                            shipData.logistic_type,

                        mode:
                            shipData.mode,

                        receiver_cost:
                            shipData.receiver_cost,

                        cost:
                            shipData.cost,

                        list_cost:
                            shipData.list_cost,

                        shipping_option:
                            shipData.shipping_option
                                ? {
                                    receiver_cost:
                                        shipData.shipping_option.receiver_cost,

                                    list_cost:
                                        shipData.shipping_option.list_cost,

                                    cost:
                                        shipData.shipping_option.cost
                                }
                                : null
                    }
                );

                resultado.informacoesEnvio = {
                    id:
                        shipData.id ||
                        order.shipping.id,

                    logistic_type:
                        shipData.logistic_type || '',

                    mode:
                        shipData.mode || '',

                    fulfillment:
                        shipData.fulfillment || '',

                    tipo:
                        shipData.logistic_type || '',

                    receiver_cost:
                        shipData.receiver_cost ?? null,

                    cost:
                        shipData.cost ?? null,

                    list_cost:
                        shipData.list_cost ?? null,

                    shipping_option:
                        shipData.shipping_option || null,

                    status:
                        shipData.status || '',

                    tags:
                        shipData.tags || []
                };

                // ============================================
                // VERIFICAR SE É ENVIO FULL
                // ============================================

                const logisticType =
                    (
                        shipData.logistic_type || ''
                    ).toLowerCase();

                const mode =
                    (
                        shipData.mode || ''
                    ).toLowerCase();

                const tags =
                    (shipData.tags || []).map(tag =>
                        String(tag).toLowerCase()
                    );

                if (
                    logisticType === 'fulfillment' ||
                    logisticType.includes('fulfillment') ||
                    logisticType.includes('full') ||
                    mode === 'full' ||
                    mode.includes('full') ||
                    tags.some(tag =>
                        tag.includes('full') ||
                        tag.includes('fulfillment')
                    )
                ) {
                    resultado.isFull = true;

                    console.log(
                        `🔴 VENDA ${order.id} É FULL ` +
                        `(logistic_type=${shipData.logistic_type})`
                    );

                    return resultado;
                }

                // ============================================
                // CALCULAR SOMENTE A PARTE PAGA PELA EMPRESA
                // ============================================

                const custoVendedor =
                    calcularFretePagoPeloVendedor(
                        shipData
                    );

                if (custoVendedor > 0) {
                    resultado.frete =
                        custoVendedor;

                    resultado.fonte =
                        'shipment.custo_liquido_vendedor';

                    console.log(
                        `💰 Custo do vendedor: ` +
                        `R$ ${resultado.frete.toFixed(2)} ` +
                        `(${resultado.fonte})`
                    );

                    return resultado;
                }
            } else {
                console.warn(
                    `⚠️ Não foi possível consultar o shipment ` +
                    `${order.shipping.id}: HTTP ${shipResp.status}`
                );
            }
        } catch (e) {
            console.warn(
                'Erro ao buscar shipment:',
                e.message
            );
        }
    }

    // ============================================
    // 2. FALLBACK COM OS DADOS DA PRÓPRIA VENDA
    // Nunca utilizar receiver_cost isoladamente.
    // ============================================

    if (
        resultado.frete === 0 &&
        order.shipping
    ) {
        const custoVendedor =
            calcularFretePagoPeloVendedor(
                order.shipping
            );

        if (custoVendedor > 0) {
            resultado.frete =
                custoVendedor;

            resultado.fonte =
                'order.shipping.custo_liquido_vendedor';

            console.log(
                `💰 Custo do vendedor: ` +
                `R$ ${resultado.frete.toFixed(2)} ` +
                `(${resultado.fonte})`
            );

            return resultado;
        }
    }

    /*
     * Não utilizar:
     *
     * - receiver_cost isoladamente;
     * - total da venda menos o valor dos produtos;
     *
     * Esses valores podem representar o frete pago pelo
     * comprador, e não o custo que saiu da empresa.
     */

    console.log(
        `⚠️ Nenhum custo de frete do vendedor ` +
        `encontrado para a venda ${order.id}`
    );

    return resultado;
}

function normalizarBuscaFretesTexto(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function formatarDataBuscaFretes(dataValor) {
    if (!dataValor) {
        return {
            br: '',
            iso: '',
            somenteNumeros: ''
        };
    }

    const data = new Date(dataValor);

    if (isNaN(data.getTime())) {
        return {
            br: '',
            iso: '',
            somenteNumeros: ''
        };
    }

    const dia =
        String(data.getDate()).padStart(2, '0');

    const mes =
        String(data.getMonth() + 1).padStart(2, '0');

    const ano =
        String(data.getFullYear());

    return {
        br: `${dia}/${mes}/${ano}`,
        iso: `${ano}-${mes}-${dia}`,
        somenteNumeros: `${dia}${mes}${ano}`
    };
}

function itemPassaFiltroStatusFretes(item) {
    if (filtroStatusReclamacao === 'todos') {
        return true;
    }

    const reclamacoes =
        Array.isArray(item.reclamacoes)
            ? item.reclamacoes
            : [];

    if (filtroStatusReclamacao === 'aberto') {
        return reclamacoes.some(
            reclamacao =>
                reclamacao.status === 'aberto'
        );
    }

    if (filtroStatusReclamacao === 'em_andamento') {
        return reclamacoes.some(
            reclamacao =>
                reclamacao.status === 'em_andamento'
        );
    }

    if (filtroStatusReclamacao === 'rejeitado') {
        return reclamacoes.some(
            reclamacao =>
                reclamacao.status === 'rejeitado'
        );
    }

    if (filtroStatusReclamacao === 'resolvido') {
        return reclamacoes.some(
            reclamacao =>
                reclamacao.status === 'resolvido'
        );
    }

    return true;
}

function itemPassaBuscaFretes(item, termo) {
    const busca =
        normalizarBuscaFretesTexto(termo);

    if (!busca) {
        return true;
    }

    const dataVenda =
        formatarDataBuscaFretes(
            item.data_venda
        );

    const valor =
        Number(
            item.valor_produto || 0
        );

    const valorBR =
        valor.toLocaleString(
            'pt-BR',
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );

    const valorPonto =
        valor.toFixed(2);

    const campos = [
        item.id,
        item.id_venda_ml,
        item.mlb,
        item.mlb_id,
        item.sku,

        // Data aceita:
        // 02/09/2026
        // 2026-09-02
        // 02092026
        dataVenda.br,
        dataVenda.iso,
        dataVenda.somenteNumeros,

        // Valor aceita:
        // 129,90
        // 129.90
        // R$ 129,90
        valorBR,
        valorPonto,
        `R$ ${valorBR}`
    ];

    return campos.some(campo =>
        normalizarBuscaFretesTexto(campo)
            .includes(busca)
    );
}

function aplicarFiltrosFretes(
    resetarPagina = true
) {
    const inputBusca =
        document.getElementById(
            'buscaFretesInput'
        );

    if (inputBusca) {
        termoBuscaFretes =
            inputBusca.value || '';
    }

    fretesFiltrados =
        fretesDadosCompletos.filter(
            item =>
                itemPassaFiltroStatusFretes(item) &&
                itemPassaBuscaFretes(
                    item,
                    termoBuscaFretes
                )
        );

    if (resetarPagina) {
        fretesPaginaAtual = 1;
    }

    const contagem =
        document.getElementById(
            'contagemFretes'
        );

    if (contagem) {
        contagem.textContent =
            `${fretesFiltrados.length} incorretos`;
    }

    const contagemReclamacoes =
        document.getElementById(
            'contagemReclamacoes'
        );

    if (contagemReclamacoes) {
        const totalReclamacoes =
            fretesFiltrados.filter(
                item =>
                    Array.isArray(item.reclamacoes) &&
                    item.reclamacoes.length > 0
            ).length;

        contagemReclamacoes.textContent =
            `${totalReclamacoes} reclamações`;
    }

    renderizarPaginaFretes();
}

function filtrarFretesBusca() {
    aplicarFiltrosFretes(true);
}

function limparBuscaFretes() {
    const input =
        document.getElementById(
            'buscaFretesInput'
        );

    if (input) {
        input.value = '';
        input.focus();
    }

    termoBuscaFretes = '';

    aplicarFiltrosFretes(true);
}

async function carregarFretesSalvos() {
    console.log(
        '📂 Carregando fretes salvos do banco...'
    );

    const tbody =
        document.getElementById(
            'shippingSimpleBody'
        );

    const contagem =
        document.getElementById(
            'contagemFretes'
        );

    if (!tbody) return;

    try {
        if (!window.supabaseClient) {
            throw new Error(
                'Supabase não inicializado'
            );
        }

        const { data, error } =
            await window.supabaseClient
                .from('fretes_ml')
                .select('*')
                .order(
                    'data_venda',
                    { ascending: false }
                );

        if (error) {
            throw error;
        }

        let reclamacoes = [];

        try {
            const {
                data: reclData,
                error: reclError
            } =
                await window.supabaseClient
                    .from('reclamacoes_frete')
                    .select(
                        'venda_id, status, id, criado_por, data_reclamacao, numero_operacao, numero_transacao, protocolos, justificativa_rejeicao'
                    )
                    .order(
                        'criado_em',
                        { ascending: false }
                    );

            if (
                !reclError &&
                reclData
            ) {
                reclamacoes =
                    reclData;
            }

        } catch (e) {
            console.warn(
                '⚠️ Erro ao buscar reclamações:',
                e.message
            );
        }

        const reclamacoesMap = {};

        if (reclamacoes.length > 0) {
            reclamacoes.forEach(
                reclamacao => {

                    if (
                        !reclamacoesMap[
                            reclamacao.venda_id
                        ]
                    ) {
                        reclamacoesMap[
                            reclamacao.venda_id
                        ] = [];
                    }

                    reclamacoesMap[
                        reclamacao.venda_id
                    ].push(
                        reclamacao
                    );
                }
            );
        }

        const dadosNormalizados =
            (data || []).map(
                item => {

                    const itemNormalizado =
                        normalizarFretePagoPeloVendedor(
                            item
                        );

                    return {
                        ...itemNormalizado,

                        tipo_envio:
                            obterTipoEnvio(
                                itemNormalizado
                            )
                    };
                }
            );

        const dados =
            dadosNormalizados.filter(
                item => {

                    if (
                        isFullByAnyField(
                            item
                        )
                    ) {
                        console.log(
                            `⏭️ Item ${item.id} é FULL`
                        );

                        return false;
                    }

                    if (
                        !item.frete_cobrado ||
                        item.frete_cobrado <= 0
                    ) {
                        return false;
                    }

                    if (
                        item.frete_cobrado < 0.5
                    ) {
                        return false;
                    }

                    const peso =
                        item.peso_estimado ||
                        0.3;

                    const freteEsperado =
                        calcularFreteEsperado(
                            item.valor_produto,
                            peso,
                            item.data_venda
                        );

                    if (
                        freteEsperado === null
                    ) {
                        return false;
                    }

                    return (
                        Math.abs(
                            item.frete_cobrado -
                            freteEsperado
                        ) > 0.01
                    );
                }
            );

        console.log(
            `📊 ${dados.length} fretes incorretos após filtro FULL`
        );

        fretesDadosCompletos =
            dados.map(
                item => {

                    const peso =
                        item.peso_estimado ||
                        0.3;

                    const freteEsperado =
                        calcularFreteEsperado(
                            item.valor_produto,
                            peso,
                            item.data_venda
                        );

                    const reclamacoesVenda =
                        reclamacoesMap[
                            item.id
                        ] || [];

                    return {
                        ...item,

                        freteEsperado:
                            freteEsperado,

                        isIncorreto:
                            true,

                        reclamacoes:
                            reclamacoesVenda,

                        temReclamacaoAberta:
                            reclamacoesVenda.some(
                                reclamacao =>
                                    reclamacao.status ===
                                        'aberto' ||
                                    reclamacao.status ===
                                        'em_andamento'
                            ),

                        temReclamacaoRejeitada:
                            reclamacoesVenda.some(
                                reclamacao =>
                                    reclamacao.status ===
                                        'rejeitado'
                            ),

                        temReclamacaoResolvida:
                            reclamacoesVenda.some(
                                reclamacao =>
                                    reclamacao.status ===
                                        'resolvido'
                            ),

                        ultimaReclamacao:
                            reclamacoesVenda.length > 0
                                ? reclamacoesVenda[0]
                                : null
                    };
                }
            );

        fretesPaginaAtual = 1;

        aplicarFiltrosFretes(
            true
        );

    } catch (error) {
        console.error(
            '❌ Erro ao carregar fretes:',
            error
        );

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="15"
                    class="text-center text-danger"
                >
                    Erro: ${error.message}
                </td>
            </tr>
        `;
    }
}

// ============================================
// RENDERIZAR PÁGINA DE FRETES - CAMPOS MAIORES
// ============================================
function renderizarPaginaFretes() {
    console.log('📄 ===== RENDERIZANDO PÁGINA =====');
    const tbody = document.getElementById('shippingSimpleBody');
    if (!tbody) {
        console.error('❌ Tbody não encontrado');
        return;
    }

    const totalItens = fretesFiltrados.length;
    
    if (totalItens === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="text-center py-5">Nenhum dado encontrado.</td></tr>';
        atualizarInfoPagina();
        return;
    }

    const totalPaginas = Math.ceil(totalItens / fretesPorPagina);
    if (fretesPaginaAtual < 1) fretesPaginaAtual = 1;
    if (fretesPaginaAtual > totalPaginas) fretesPaginaAtual = totalPaginas;
    
    const inicio = (fretesPaginaAtual - 1) * fretesPorPagina;
    const fim = Math.min(inicio + fretesPorPagina, totalItens);
    const paginaDados = fretesFiltrados.slice(inicio, fim);

    if (paginaDados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="text-center py-5">Nenhum dado nesta página.</td></tr>';
        atualizarInfoPagina();
        return;
    }

    tbody.innerHTML = '';
    
    paginaDados.forEach((item) => {
        const row = document.createElement('tr');
        
        // ===== DIMENSÕES: PADRÃO 22x16x1 =====
        let comprimento = DEFAULT_DIMENSIONS.comprimento; // 22
        let largura = DEFAULT_DIMENSIONS.largura;        // 16
        let altura = DEFAULT_DIMENSIONS.altura;          // 1
        
        if (item.comprimento_cm && item.comprimento_cm > 0) {
            comprimento = item.comprimento_cm;
        }
        if (item.largura_cm && item.largura_cm > 0) {
            largura = item.largura_cm;
        }
        if (item.altura_cm && item.altura_cm > 0) {
            altura = item.altura_cm;
        }
        
        const peso = item.peso_estimado || 0.3;
        const valorProduto = item.valor_produto || 0;
        const freteCobrado = item.frete_cobrado || 0;
        const quantidade = item.quantidade || 1;
        const sku = item.sku || 'N/A';
        const fotoUrl = item.foto_url || null;
        const freteEsperado = item.freteEsperado;

        const pesoVol = calcularPesoVolumetrico(comprimento, largura, altura);
        let statusClass = 'secondary', statusText = 'Não calculado', diferenca = 0;
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

        let badgeReclamacao = '';
        if (item.temReclamacaoAberta) {
            badgeReclamacao = '<span class="badge badge-info ml-1"><i class="fas fa-clock"></i> Em andamento</span>';
        } else if (item.temReclamacaoRejeitada) {
            badgeReclamacao = '<span class="badge badge-danger ml-1"><i class="fas fa-times"></i> Rejeitada</span>';
        } else if (item.temReclamacaoResolvida) {
            badgeReclamacao = '<span class="badge badge-success ml-1"><i class="fas fa-check"></i> Resolvida</span>';
        }

        let infoReclamacao = '';
        if (item.ultimaReclamacao) {
            infoReclamacao = `
                <div style="font-size: 9px; color: #6c757d; margin-top: 2px; line-height: 1.2;">
                    ${item.ultimaReclamacao.status}: ${item.ultimaReclamacao.numero_operacao || ''}
                    ${item.ultimaReclamacao.numero_transacao ? `| TRANS: ${item.ultimaReclamacao.numero_transacao}` : ''}
                </div>
            `;
        }

        let fotoThumb = '';
        if (fotoUrl) {
            fotoThumb = `<img src="${fotoUrl}" style="width:35px; height:35px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="window.open('${fotoUrl}','_blank')">`;
        } else {
            fotoThumb = '<span class="text-muted" style="font-size:10px;">Sem foto</span>';
        }

        const dataVenda = item.data_venda ? new Date(item.data_venda).toLocaleDateString('pt-BR') : '-';
        const freteCobradoDisplay = freteCobrado > 0 ? `R$ ${freteCobrado.toFixed(2)}` : 'R$ 0,00';
        const skuDisplay = sku && sku !== 'N/A' ? sku : 'N/A';

        row.innerHTML = `
            <td><strong style="font-size:11px;">${item.id}</strong></td>
            <td style="max-width:180px; word-wrap:break-word; font-size:11px;">${item.titulo || 'Sem título'}</td>
            <td><code style="font-size:10px; word-break:break-all;">${skuDisplay}</code></td>
            <td><code style="font-size:10px;">${item.mlb || 'N/A'}</code></td>
            <td style="font-weight:600; color:#28a745; font-size:12px; text-align:right;">R$ ${valorProduto.toFixed(2)}</td>
            <td style="text-align:center; font-size:12px;">${quantidade}</td>
            <td style="font-weight:700; color:#dc3545; font-size:12px; text-align:right;">${freteCobradoDisplay}</td>
            <td class="frete-esperado-cell" style="font-weight:600; color:#17a2b8; font-size:12px; text-align:right;">${freteEsperado !== null ? `R$ ${freteEsperado.toFixed(2)}` : 'N/A'}</td>
            <td style="min-width:130px;">
                <span class="badge badge-${statusClass} status-badge" style="font-size:10px;">${statusText}</span>
                ${badgeReclamacao}
                ${infoReclamacao}
            </td>
            <td style="min-width:65px;">
                <input type="number" class="form-control form-control-sm peso-input" 
                       value="${peso}" step="0.01" min="0" 
                       data-venda-id="${item.id}" style="width:70px; font-size:12px; padding:4px 6px;">
            </td>
            <td style="min-width:220px; padding: 4px 8px;">
                <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
                    <input type="text" class="form-control form-control-sm medida-input" 
                           value="${comprimento}" 
                           data-venda-id="${item.id}" data-medida="comprimento" 
                           style="width:50px; font-size:13px; padding:4px 6px; text-align:center; height:32px;" 
                           placeholder="C" maxlength="6">
                    <span style="font-size:12px; font-weight:bold;">x</span>
                    <input type="text" class="form-control form-control-sm medida-input" 
                           value="${largura}" 
                           data-venda-id="${item.id}" data-medida="largura" 
                           style="width:50px; font-size:13px; padding:4px 6px; text-align:center; height:32px;" 
                           placeholder="L" maxlength="6">
                    <span style="font-size:12px; font-weight:bold;">x</span>
                    <input type="text" class="form-control form-control-sm medida-input" 
                           value="${altura}" 
                           data-venda-id="${item.id}" data-medida="altura" 
                           style="width:50px; font-size:13px; padding:4px 6px; text-align:center; height:32px;" 
                           placeholder="A" maxlength="6">
                    <button class="btn btn-sm btn-success btn-salvar-medidas" 
                            data-venda-id="${item.id}" 
                            data-sku="${sku}"
                            style="padding:4px 8px; font-size:11px; height:32px;">
                        <i class="fas fa-save"></i>
                    </button>
                </div>
                <div style="font-size:9px; color:#6c757d; margin-top:3px;">
                    Vol: <span class="peso-volumetrico-display">${pesoVol.toFixed(4)}</span> m³
                </div>
            </td>
            <td style="min-width:70px; text-align:center;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                    ${fotoThumb}
                    <button class="btn btn-sm btn-outline-secondary" onclick="abrirEditorFoto('${item.id}', '${sku}')" title="Editar foto" style="padding:2px 8px; font-size:9px;">
                        <i class="fas fa-camera"></i>
                    </button>
                </div>
            </td>
            <td style="min-width:90px;">
                <button class="btn btn-sm btn-primary btn-reclamar" 
                        data-venda-id="${item.id}"
                        data-valor="${valorProduto}"
                        data-frete-cobrado="${freteCobrado}"
                        data-frete-esperado="${freteEsperado !== null ? freteEsperado : 0}"
                        ${item.temReclamacaoAberta ? 'disabled' : ''}
                        style="padding:4px 6px; font-size:10px; width:100%;">
                    <i class="fas fa-comment-dots"></i> Reclamar
                </button>
                ${item.temReclamacaoAberta || item.temReclamacaoRejeitada || item.temReclamacaoResolvida ? 
                    `<button class="btn btn-sm btn-info btn-ver-reclamacao" data-venda-id="${item.id}" title="Ver reclamações" style="padding:4px 6px; font-size:10px; width:100%; margin-top:2px;">
                        <i class="fas fa-eye"></i> Ver
                    </button>` : ''}
            </td>
            <td style="font-size:10px;">${dataVenda}</td>
            <td style="text-align:center;">${renderizarBadgeTipoEnvio(item)}</td>
        `;

        tbody.appendChild(row);

        // Event listeners
        const btnSalvar = row.querySelector('.btn-salvar-medidas');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', function() {
                salvarMedidasERecalcular(row, this.dataset.vendaId, this.dataset.sku);
            });
        }

        // Enter key para salvar
        const medidasInputs = row.querySelectorAll('.medida-input');
        medidasInputs.forEach(input => {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    const btnSalvar = this.closest('tr').querySelector('.btn-salvar-medidas');
                    if (btnSalvar) {
                        btnSalvar.click();
                    }
                }
            });
        });

        const btnReclamar = row.querySelector('.btn-reclamar');
        if (btnReclamar) {
            btnReclamar.addEventListener('click', function() {
                const vendaId = this.dataset.vendaId;
                const valor = parseFloat(this.dataset.valor) || 0;
                const freteCobrado = parseFloat(this.dataset.freteCobrado) || 0;
                const freteEsperado = parseFloat(this.dataset.freteEsperado) || 0;
                abrirModalReclamacaoCompleta(vendaId, valor, freteCobrado, freteEsperado);
            });
        }

        const btnVerReclamacao = row.querySelector('.btn-ver-reclamacao');
        if (btnVerReclamacao) {
            btnVerReclamacao.addEventListener('click', function() {
                verHistoricoReclamacoes(this.dataset.vendaId);
            });
        }
    });

    atualizarInfoPagina();
}

// Adicione esta função para validar os campos de dimensão
function validarMedida(valor, nome) {
    const num = parseFloat(valor);
    if (isNaN(num) || num <= 0) {
        showToast(`Por favor, insira um valor válido para ${nome}`, 'warning');
        return false;
    }
    if (num > 999) {
        showToast(`Valor muito alto para ${nome}`, 'warning');
        return false;
    }
    return true;
}

async function salvarMedidasERecalcular(
    row,
    vendaId,
    sku
) {
    try {
        const compInput =
            row.querySelector(
                '.medida-input[data-medida="comprimento"]'
            );

        const largInput =
            row.querySelector(
                '.medida-input[data-medida="largura"]'
            );

        const altInput =
            row.querySelector(
                '.medida-input[data-medida="altura"]'
            );

        const pesoInput =
            row.querySelector(
                '.peso-input'
            );

        const comprimento =
            parseFloat(
                compInput?.value
            ) ||
            DEFAULT_DIMENSIONS.comprimento;

        const largura =
            parseFloat(
                largInput?.value
            ) ||
            DEFAULT_DIMENSIONS.largura;

        const altura =
            parseFloat(
                altInput?.value
            ) ||
            DEFAULT_DIMENSIONS.altura;

        const peso =
            parseFloat(
                pesoInput?.value
            ) ||
            0.3;

        if (
            comprimento <= 0 ||
            largura <= 0 ||
            altura <= 0 ||
            peso <= 0
        ) {
            showToast(
                'Medidas e peso devem ser ' +
                'maiores que zero.',
                'warning'
            );

            return;
        }

        await salvarMedidasSKU(
            sku,
            comprimento,
            largura,
            altura,
            peso
        );

        const pesoVol =
            calcularPesoVolumetrico(
                comprimento,
                largura,
                altura
            );

        const {
            error
        } = await window.supabaseClient
            .from('fretes_ml')
            .update({
                comprimento_cm:
                    comprimento,

                largura_cm:
                    largura,

                altura_cm:
                    altura,

                peso_estimado:
                    peso,

                peso_volumetrico:
                    pesoVol,

                updated_at:
                    new Date()
                        .toISOString()
            })
            .eq(
                'id',
                vendaId
            );

        if (error) {
            throw error;
        }

        const valorCell =
            row.querySelector(
                'td:nth-child(5)'
            );

        const valorText =
            valorCell
                ?.textContent
                .replace('R$ ', '')
                .replace(/\./g, '')
                .replace(',', '.') ||
            '0';

        const valorProduto =
            parseFloat(valorText) || 0;

        const vendaAtual =
            fretesDadosCompletos.find(
                item =>
                    String(item.id) ===
                    String(vendaId)
            );

        const freteEsperado =
            calcularFreteEsperado(
                valorProduto,
                peso,
                item.data_venda,
                vendaAtual?.data_venda
            );

        const freteCobradoCell =
            row.querySelector(
                'td:nth-child(7)'
            );

        const freteCobradoText =
            freteCobradoCell
                ?.textContent
                .replace('R$ ', '')
                .replace(/\./g, '')
                .replace(',', '.') ||
            '0';

        const freteCobrado =
            parseFloat(
                freteCobradoText
            ) || 0;

        const freteEsperadoCell =
            row.querySelector(
                '.frete-esperado-cell'
            );

        const statusBadge =
            row.querySelector(
                '.status-badge'
            );

        const volDisplay =
            row.querySelector(
                '.peso-volumetrico-display'
            );

        if (
            freteEsperado !== null
        ) {
            if (freteEsperadoCell) {
                freteEsperadoCell.textContent =
                    `R$ ${freteEsperado.toFixed(2)}`;
            }

            const diferenca =
                freteCobrado -
                freteEsperado;

            const diffAbs =
                Math.abs(diferenca);

            let statusClass;
            let statusText;

            if (diffAbs < 0.01) {
                statusClass =
                    'success';

                statusText =
                    '✅ Correto';

                await window.supabaseClient
                    .from('fretes_ml')
                    .delete()
                    .eq(
                        'id',
                        vendaId
                    );

                showToast(
                    '✅ Frete corrigido! ' +
                    'Registro removido.',
                    'success'
                );

                await carregarFretesSalvos();

                return;

            } else if (
                diferenca > 0
            ) {
                statusClass =
                    'danger';

                statusText =
                    `❌ Acima ` +
                    `(R$ ${diferenca.toFixed(2)})`;

            } else {
                statusClass =
                    'warning';

                statusText =
                    `⚠️ Abaixo ` +
                    `(R$ ${Math.abs(diferenca).toFixed(2)})`;
            }

            if (statusBadge) {
                statusBadge.className =
                    `badge badge-${statusClass} ` +
                    `status-badge`;

                statusBadge.textContent =
                    statusText;
            }
        }

        if (volDisplay) {
            volDisplay.textContent =
                pesoVol.toFixed(3);
        }

        showToast(
            `✅ Medidas salvas para ${sku}! ` +
            `(${comprimento}x${largura}x${altura}cm)`,
            'success'
        );

    } catch (error) {
        console.error(
            'Erro ao salvar medidas:',
            error
        );

        showToast(
            'Erro ao salvar: ' +
            error.message,
            'error'
        );
    }
}

function filtrarReclamacoes(status) {
    console.log(
        `📌 Filtrando reclamações por: ${status}`
    );

    filtroStatusReclamacao =
        status;

    document
        .querySelectorAll(
            '.btn-filtro-reclamacao'
        )
        .forEach(btn => {

            btn.classList.remove(
                'btn-primary',
                'active'
            );

            btn.classList.add(
                'btn-outline-secondary'
            );
        });

    const btn =
        document.querySelector(
            `.btn-filtro-reclamacao[data-status="${status}"]`
        );

    if (btn) {
        btn.classList.remove(
            'btn-outline-warning',
            'btn-outline-info',
            'btn-outline-danger',
            'btn-outline-success',
            'btn-outline-secondary'
        );

        btn.classList.add(
            'btn-primary',
            'active'
        );
    }

    /*
     * Não precisa consultar o Supabase novamente.
     *
     * Isso combina o filtro de reclamação
     * com o novo campo de pesquisa.
     */
    aplicarFiltrosFretes(
        true
    );
}

// ============================================
// ATUALIZAR INFORMAÇÕES DA PÁGINA (VERSÃO CORRIGIDA)
// ============================================
function atualizarInfoPagina() {
    const total = fretesFiltrados.length;
    
    if (total === 0) {
        const infoEl = document.getElementById('infoFretes');
        if (infoEl) infoEl.textContent = 'Nenhum registro';
        
        const btnAnterior = document.getElementById('btnFretesAnterior');
        const btnProxima = document.getElementById('btnFretesProxima');
        const paginaDisplay = document.getElementById('paginaAtualDisplay');
        
        if (btnAnterior) {
            btnAnterior.disabled = true;
            btnAnterior.style.opacity = '0.5';
        }
        if (btnProxima) {
            btnProxima.disabled = true;
            btnProxima.style.opacity = '0.5';
        }
        if (paginaDisplay) {
            paginaDisplay.textContent = 'Página 0 de 0';
        }
        return;
    }
    
    const totalPaginas = Math.ceil(total / fretesPorPagina);
    
    // Garantir que a página atual está dentro dos limites
    if (fretesPaginaAtual < 1) fretesPaginaAtual = 1;
    if (fretesPaginaAtual > totalPaginas) fretesPaginaAtual = totalPaginas;
    
    const inicio = (fretesPaginaAtual - 1) * fretesPorPagina + 1;
    const fim = Math.min(inicio + fretesPorPagina - 1, total);

    // Atualizar texto de informação
    const infoEl = document.getElementById('infoFretes');
    if (infoEl) {
        infoEl.textContent = `Mostrando ${inicio}-${fim} de ${total}`;
    }

    // Atualizar display da página
    const paginaDisplay = document.getElementById('paginaAtualDisplay');
    if (paginaDisplay) {
        paginaDisplay.textContent = `Página ${fretesPaginaAtual} de ${totalPaginas}`;
    }

    // Atualizar botões
    const btnAnterior = document.getElementById('btnFretesAnterior');
    const btnProxima = document.getElementById('btnFretesProxima');
    
    if (btnAnterior) {
        btnAnterior.disabled = fretesPaginaAtual <= 1;
        btnAnterior.style.opacity = fretesPaginaAtual <= 1 ? '0.5' : '1';
        btnAnterior.style.cursor = fretesPaginaAtual <= 1 ? 'not-allowed' : 'pointer';
    }
    
    if (btnProxima) {
        btnProxima.disabled = fretesPaginaAtual >= totalPaginas;
        btnProxima.style.opacity = fretesPaginaAtual >= totalPaginas ? '0.5' : '1';
        btnProxima.style.cursor = fretesPaginaAtual >= totalPaginas ? 'not-allowed' : 'pointer';
    }
    
    console.log(`📄 Página ${fretesPaginaAtual}/${totalPaginas} - Itens ${inicio}-${fim} de ${total}`);
}

// ============================================
// NAVEGAÇÃO DA PÁGINA (VERSÃO CORRIGIDA - SEM DUPLICAÇÃO)
// ============================================
function paginaFretesAnterior() {
    console.log('⬅️ Botão Anterior clicado. Página atual:', fretesPaginaAtual);
    
    if (fretesPaginaAtual > 1) {
        fretesPaginaAtual--;
        console.log('📄 Nova página:', fretesPaginaAtual);
        renderizarPaginaFretes();
    } else {
        console.log('⚠️ Já está na primeira página');
    }
}

function paginaFretesProxima() {
    console.log('➡️ Botão Próximo clicado. Página atual:', fretesPaginaAtual);
    
    const totalPaginas = Math.max(1, Math.ceil(fretesFiltrados.length / fretesPorPagina));
    console.log('📄 Total de páginas:', totalPaginas);
    
    if (fretesPaginaAtual < totalPaginas) {
        fretesPaginaAtual++;
        console.log('📄 Nova página:', fretesPaginaAtual);
        renderizarPaginaFretes();
    } else {
        console.log('⚠️ Já está na última página');
        showToast('Você já está na última página', 'info');
    }
}

// ============================================
// DEBUG DA PAGINAÇÃO
// ============================================
function debugPaginacao() {
    console.log('🔍 ===== DEBUG PAGINAÇÃO =====');
    console.log('📊 fretesFiltrados.length:', fretesFiltrados.length);
    console.log('📊 fretesPorPagina:', fretesPorPagina);
    console.log('📊 fretesPaginaAtual:', fretesPaginaAtual);
    console.log('📊 totalPaginas:', Math.ceil(fretesFiltrados.length / fretesPorPagina));
    console.log('📊 inicio:', (fretesPaginaAtual - 1) * fretesPorPagina);
    console.log('📊 fim:', Math.min((fretesPaginaAtual) * fretesPorPagina, fretesFiltrados.length));
    
    if (fretesFiltrados.length > 0) {
        const primeiro = fretesFiltrados[(fretesPaginaAtual - 1) * fretesPorPagina];
        const ultimoIndex = Math.min((fretesPaginaAtual) * fretesPorPagina - 1, fretesFiltrados.length - 1);
        const ultimo = fretesFiltrados[ultimoIndex];
        console.log('📊 Primeiro ID:', primeiro?.id);
        console.log('📊 Último ID:', ultimo?.id);
    }
    console.log('🔍 ===== FIM DEBUG =====');
}

// ============================================
// IR PARA UMA PÁGINA ESPECÍFICA (OPCIONAL)
// ============================================
function irParaPaginaFretes(pagina) {
    const totalPaginas = Math.max(1, Math.ceil(fretesFiltrados.length / fretesPorPagina));
    if (pagina >= 1 && pagina <= totalPaginas) {
        fretesPaginaAtual = pagina;
        renderizarPaginaFretes();
        const table = document.getElementById('shippingSimpleTable');
        if (table) {
            table.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// ============================================
// GERAR NÚMEROS DE PÁGINA (OPCIONAL)
// ============================================
function gerarNumerosPagina() {
    const container = document.getElementById('paginacaoNumeros');
    if (!container) return;
    
    const totalPaginas = Math.max(1, Math.ceil(fretesFiltrados.length / fretesPorPagina));
    const paginaAtual = fretesPaginaAtual;
    
    let html = '';
    const maxBotoes = 7;
    let inicio = Math.max(1, paginaAtual - 3);
    let fim = Math.min(totalPaginas, inicio + maxBotoes - 1);
    
    if (fim - inicio < maxBotoes - 1) {
        inicio = Math.max(1, fim - maxBotoes + 1);
    }
    
    for (let i = inicio; i <= fim; i++) {
        const isAtiva = i === paginaAtual;
        html += `
            <button class="btn btn-sm ${isAtiva ? 'btn-primary' : 'btn-outline-secondary'}" 
                    onclick="irParaPaginaFretes(${i})"
                    style="min-width: 35px;">
                ${i}
            </button>
        `;
    }
    
    container.innerHTML = html;
}

// ============================================
// FUNÇÃO PARA CRIAR O MODAL DE RECLAMAÇÃO
// ============================================
function criarModalReclamacaoCompleta() {
    if (document.getElementById('modalReclamacaoCompleta')) return;

    const modalHTML = `
        <div id="modalReclamacaoCompleta" class="modal hidden">
            <div class="modal-content" style="max-width: 750px; max-height: 90vh; overflow-y: auto; padding: 0;">
                <div style="background: linear-gradient(135deg, #00ADEE, #80D6F7); color: white; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin:0;"><i class="fas fa-comment-dots"></i> Nova Reclamação de Frete</h3>
                    <button onclick="fecharModalReclamacaoCompleta()" style="background:none; border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
                </div>

                <div style="padding: 20px;">
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <p style="margin: 4px 0;"><strong>Venda:</strong> <span id="reclamacaoNumeroVendaDisplay">-</span></p>
                            <p style="margin: 4px 0;"><strong>Valor Produto:</strong> R$ <span id="reclamacaoValorProdutoDisplay">0,00</span></p>
                        </div>
                        <div>
                            <p style="margin: 4px 0;"><strong>Frete Cobrado:</strong> R$ <span id="reclamacaoFreteCobradoDisplay">0,00</span></p>
                            <p style="margin: 4px 0;"><strong>Frete Esperado:</strong> R$ <span id="reclamacaoFreteEsperadoDisplay">0,00</span></p>
                            <p style="margin: 4px 0;"><strong>Diferença:</strong> R$ <span id="reclamacaoDiferencaDisplay" style="font-weight: bold;">0,00</span></p>
                        </div>
                    </div>

                    <input type="hidden" id="reclamacaoId">
                    <input type="hidden" id="reclamacaoVendaId">
                    <input type="hidden" id="reclamacaoValorProduto">
                    <input type="hidden" id="reclamacaoFreteCobrado">
                    <input type="hidden" id="reclamacaoFreteEsperado">
                    <input type="hidden" id="reclamacaoDiferenca">

                    <div class="form-group">
                        <label><strong>Tipo de referência *</strong></label>
                        <div class="d-flex gap-3">
                            <label><input type="radio" name="tipoReferencia" value="venda" checked onchange="toggleReferenciaFields()"> Venda</label>
                            <label><input type="radio" name="tipoReferencia" value="retirada" onchange="toggleReferenciaFields()"> Retirada FULL</label>
                        </div>
                    </div>

                    <div class="form-group" id="campoNumeroVenda">
                        <label><i class="fas fa-tag"></i> Número da Venda (16 caracteres)</label>
                        <input type="text" id="reclamacaoNumeroVenda" class="form-control" placeholder="Ex: 1234567890123456" maxlength="16">
                        <small style="color: #6c757d;">Deve ter exatamente 16 caracteres</small>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-exclamation-circle"></i> Número da Reclamação *</label>
                        <input type="text" id="reclamacaoNumeroReclamacao" class="form-control" placeholder="Ex: REC123456" required>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-tag"></i> Tipo de reclamação *</label>
                        <div class="d-flex gap-3">
                            <label><input type="radio" name="tipoReclamacao" value="com_reembolso" checked onchange="toggleCamposReclamacao()"> Com reembolso</label>
                            <label><input type="radio" name="tipoReclamacao" value="sem_reembolso" onchange="toggleCamposReclamacao()"> Sem reembolso (apenas acompanhamento)</label>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-md-6">
                            <div class="form-group">
                                <label><i class="fas fa-money-bill-wave"></i> Valor *</label>
                                <input type="number" id="reclamacaoValor" class="form-control" step="0.01" min="0" placeholder="0,00" value="0">
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="form-group">
                                <label><i class="fas fa-calendar"></i> Data *</label>
                                <input type="date" id="reclamacaoData" class="form-control" required>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-question-circle"></i> Motivo *</label>
                        <select id="reclamacaoMotivo" class="form-control" required>
                            <option value="">Selecione o motivo</option>
                            <option value="Frete">Frete</option>
                            <option value="Extravio no envio">Extravio no envio</option>
                            <option value="Extravio na devolução">Extravio na devolução</option>
                            <option value="Devolução danificada">Devolução danificada</option>
                            <option value="Valor incorreto">Valor incorreto</option>
                            <option value="Prazo de entrega">Prazo de entrega</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-list"></i> Protocolos</label>
                        <div class="d-flex gap-2">
                            <input type="text" id="campoProtocolo" class="form-control" placeholder="Número do protocolo">
                            <button type="button" class="btn btn-primary btn-sm" onclick="adicionarProtocolo()">
                                <i class="fas fa-plus"></i> Adicionar
                            </button>
                        </div>
                        <div id="listaProtocolos" style="margin-top: 10px; max-height: 120px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 4px; padding: 5px; background: #fafafa;">
                            <small style="color: #6c757d;">Nenhum protocolo adicionado</small>
                        </div>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-tag"></i> Status *</label>
                        <select id="reclamacaoStatus" class="form-control" onchange="onStatusChange()" required>
                            <option value="aberto">Aberto</option>
                            <option value="em_andamento">Em andamento</option>
                            <option value="rejeitado">Rejeitado</option>
                            <option value="resolvido">Resolvido</option>
                        </select>
                    </div>

                    <div id="campoJustificativa" style="display: none;">
                        <div class="form-group">
                            <label><i class="fas fa-comment"></i> Justificativa da Rejeição *</label>
                            <textarea id="reclamacaoJustificativa" class="form-control" rows="3" placeholder="Descreva o motivo da rejeição..."></textarea>
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-paperclip"></i> Anexar Arquivo</label>
                            <input type="file" id="reclamacaoArquivo" class="form-control" accept=".pdf,.jpg,.png,.doc,.docx">
                            <small style="color: #6c757d;">Anexe evidências (PDF, imagem, documento)</small>
                        </div>
                    </div>

                    <div id="campoNumeroTransacao" style="display: none;">
                        <div class="form-group">
                            <label><i class="fas fa-exchange-alt"></i> Número da Transação *</label>
                            <input type="text" id="reclamacaoNumeroTransacao" class="form-control" placeholder="Ex: TRANS123456">
                            <small style="color: #6c757d;">Número da transação do reembolso</small>
                        </div>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-sticky-note"></i> Observações</label>
                        <textarea id="reclamacaoObservacoes" class="form-control" rows="3" placeholder="Detalhes sobre a reclamação..."></textarea>
                    </div>

                    <div class="d-flex justify-content-end gap-2 mt-3">
                        <button type="button" class="btn btn-secondary" onclick="fecharModalReclamacaoCompleta()">Cancelar</button>
                        <button type="button" class="btn btn-success" onclick="salvarReclamacaoCompleta()">
                            <i class="fas fa-save"></i> Salvar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);
}

// ============================================
// FUNÇÕES DO MODAL DE RECLAMAÇÃO
// ============================================
function fecharModalReclamacaoCompleta() {
    const modal = document.getElementById('modalReclamacaoCompleta');
    if (modal) modal.classList.add('hidden');
    protocolosTemp = [];
    currentReclamacaoId = null;
}

function toggleReferenciaFields() {
    const tipo = document.querySelector('input[name="tipoReferencia"]:checked')?.value || 'venda';
    const campoNumeroVenda = document.getElementById('campoNumeroVenda');
    if (campoNumeroVenda) {
        campoNumeroVenda.style.display = tipo === 'venda' ? 'block' : 'none';
    }
}

function toggleCamposReclamacao() {
    const tipo = document.querySelector('input[name="tipoReclamacao"]:checked')?.value || 'com_reembolso';
    const campoValor = document.getElementById('reclamacaoValor');
    if (campoValor) {
        campoValor.disabled = tipo === 'sem_reembolso';
        if (tipo === 'sem_reembolso') {
            campoValor.value = '0';
        }
    }
}

function onStatusChange() {
    const status = document.getElementById('reclamacaoStatus')?.value;
    const campoJustificativa = document.getElementById('campoJustificativa');
    const campoNumeroTransacao = document.getElementById('campoNumeroTransacao');
    
    if (campoJustificativa) {
        campoJustificativa.style.display = status === 'rejeitado' ? 'block' : 'none';
        if (status === 'rejeitado') {
            document.getElementById('reclamacaoJustificativa').required = true;
        } else {
            document.getElementById('reclamacaoJustificativa').required = false;
        }
    }
    if (campoNumeroTransacao) {
        campoNumeroTransacao.style.display = status === 'resolvido' ? 'block' : 'none';
        if (status === 'resolvido') {
            document.getElementById('reclamacaoNumeroTransacao').required = true;
        } else {
            document.getElementById('reclamacaoNumeroTransacao').required = false;
        }
    }
}

function adicionarProtocolo() {
    const input = document.getElementById('campoProtocolo');
    if (!input) return;
    
    const protocolo = input.value.trim();
    if (!protocolo) {
        showToast('Digite um número de protocolo', 'warning');
        return;
    }
    
    if (protocolosTemp.includes(protocolo)) {
        showToast('Protocolo já adicionado', 'warning');
        return;
    }
    
    protocolosTemp.push(protocolo);
    input.value = '';
    renderizarProtocolos();
}

function removerProtocolo(index) {
    protocolosTemp.splice(index, 1);
    renderizarProtocolos();
}

function renderizarProtocolos() {
    const container = document.getElementById('listaProtocolos');
    if (!container) return;
    
    if (protocolosTemp.length === 0) {
        container.innerHTML = '<small style="color: #6c757d;">Nenhum protocolo adicionado</small>';
        return;
    }
    
    container.innerHTML = protocolosTemp.map((p, i) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; background: #f8f9fa; border-radius: 4px; margin-bottom: 4px; border-left: 3px solid #00ADEE;">
            <span style="font-size: 13px;"><i class="fas fa-hashtag" style="color:#00ADEE;"></i> ${p}</span>
            <button type="button" class="btn btn-sm btn-danger" onclick="removerProtocolo(${i})" style="padding: 0 6px; font-size: 12px;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// ============================================
// ABRIR MODAL DE RECLAMAÇÃO
// ============================================
function abrirModalReclamacaoCompleta(vendaId, valorProduto, freteCobrado, freteEsperado) {
    let modal = document.getElementById('modalReclamacaoCompleta');
    if (!modal) {
        criarModalReclamacaoCompleta();
        modal = document.getElementById('modalReclamacaoCompleta');
        if (!modal) {
            showToast('Erro ao criar modal. Tente novamente.', 'error');
            return;
        }
    }

    const elementos = {
        vendaId: document.getElementById('reclamacaoVendaId'),
        valorProduto: document.getElementById('reclamacaoValorProduto'),
        freteCobrado: document.getElementById('reclamacaoFreteCobrado'),
        freteEsperado: document.getElementById('reclamacaoFreteEsperado'),
        diferenca: document.getElementById('reclamacaoDiferenca'),
        status: document.getElementById('reclamacaoStatus'),
        data: document.getElementById('reclamacaoData'),
        numeroReclamacao: document.getElementById('reclamacaoNumeroReclamacao'),
        numeroOperacao: document.getElementById('reclamacaoNumeroOperacao'),
        observacoes: document.getElementById('reclamacaoObservacoes'),
        justificativa: document.getElementById('reclamacaoJustificativa'),
        numeroTransacao: document.getElementById('reclamacaoNumeroTransacao'),
        id: document.getElementById('reclamacaoId'),
        valor: document.getElementById('reclamacaoValor'),
        motivo: document.getElementById('reclamacaoMotivo'),
        campoProtocolo: document.getElementById('campoProtocolo'),
        listaProtocolos: document.getElementById('listaProtocolos'),
        campoJustificativa: document.getElementById('campoJustificativa'),
        campoNumeroTransacao: document.getElementById('campoNumeroTransacao'),
        campoNumeroVenda: document.getElementById('campoNumeroVenda'),
        valorDisplay: document.getElementById('reclamacaoValorProdutoDisplay'),
        freteCobradoDisplay: document.getElementById('reclamacaoFreteCobradoDisplay'),
        freteEsperadoDisplay: document.getElementById('reclamacaoFreteEsperadoDisplay'),
        diferencaDisplay: document.getElementById('reclamacaoDiferencaDisplay'),
        numeroVendaDisplay: document.getElementById('reclamacaoNumeroVendaDisplay')
    };

    const elementosFaltando = Object.entries(elementos)
        .filter(([key, el]) => !el)
        .map(([key]) => key);

    if (elementosFaltando.length > 0) {
        console.error('Elementos faltando no modal:', elementosFaltando);
        const modalAntigo = document.getElementById('modalReclamacaoCompleta');
        if (modalAntigo) modalAntigo.remove();
        criarModalReclamacaoCompleta();
        setTimeout(() => abrirModalReclamacaoCompleta(vendaId, valorProduto, freteCobrado, freteEsperado), 300);
        return;
    }

    const diferenca = freteCobrado - freteEsperado;
    
    elementos.vendaId.value = vendaId || '';
    elementos.valorProduto.value = (valorProduto || 0).toFixed(2);
    elementos.freteCobrado.value = (freteCobrado || 0).toFixed(2);
    elementos.freteEsperado.value = (freteEsperado || 0).toFixed(2);
    elementos.diferenca.value = diferenca.toFixed(2);
    elementos.status.value = 'aberto';
    elementos.data.value = new Date().toISOString().split('T')[0];
    
    elementos.valorDisplay.textContent = (valorProduto || 0).toFixed(2);
    elementos.freteCobradoDisplay.textContent = (freteCobrado || 0).toFixed(2);
    elementos.freteEsperadoDisplay.textContent = (freteEsperado || 0).toFixed(2);
    elementos.diferencaDisplay.textContent = diferenca.toFixed(2);
    elementos.diferencaDisplay.style.color = diferenca > 0 ? '#dc3545' : (diferenca < 0 ? '#28a745' : '#6c757d');
    elementos.numeroVendaDisplay.textContent = vendaId || '-';
    
    elementos.numeroReclamacao.value = '';
    elementos.numeroOperacao.value = '';
    elementos.observacoes.value = '';
    elementos.justificativa.value = '';
    elementos.numeroTransacao.value = '';
    elementos.id.value = '';
    elementos.valor.value = '0';
    elementos.motivo.value = '';
    
    protocolosTemp = [];
    if (elementos.listaProtocolos) {
        elementos.listaProtocolos.innerHTML = '<small style="color: #6c757d;">Nenhum protocolo adicionado</small>';
    }
    if (elementos.campoProtocolo) {
        elementos.campoProtocolo.value = '';
    }
    
    if (elementos.campoJustificativa) {
        elementos.campoJustificativa.style.display = 'none';
    }
    if (elementos.campoNumeroTransacao) {
        elementos.campoNumeroTransacao.style.display = 'none';
    }
    
    modal.classList.remove('hidden');
    carregarReclamacaoExistente(vendaId);
}

// ============================================
// CARREGAR RECLAMAÇÃO EXISTENTE
// ============================================
async function carregarReclamacaoExistente(vendaId) {
    try {
        if (!window.supabaseClient) return;
        
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('venda_id', vendaId)
            .order('criado_em', { ascending: false })
            .limit(1);
        
        if (error) throw error;
        if (data && data.length > 0) {
            const recl = data[0];
            currentReclamacaoId = recl.id;
            document.getElementById('reclamacaoId').value = recl.id;
            document.getElementById('reclamacaoNumeroReclamacao').value = recl.numero_reclamacao || '';
            document.getElementById('reclamacaoNumeroOperacao').value = recl.numero_operacao || '';
            document.getElementById('reclamacaoValor').value = recl.valor || 0;
            document.getElementById('reclamacaoData').value = recl.data_reclamacao ? recl.data_reclamacao.split('T')[0] : new Date().toISOString().split('T')[0];
            document.getElementById('reclamacaoMotivo').value = recl.motivo || '';
            document.getElementById('reclamacaoStatus').value = recl.status || 'aberto';
            document.getElementById('reclamacaoObservacoes').value = recl.observacoes || '';
            document.getElementById('reclamacaoJustificativa').value = recl.justificativa_rejeicao || '';
            document.getElementById('reclamacaoNumeroTransacao').value = recl.numero_transacao || '';
            
            if (recl.protocolos && recl.protocolos.length > 0) {
                protocolosTemp = recl.protocolos;
                renderizarProtocolos();
            }
            
            if (recl.tipo_referencia) {
                document.querySelector(`input[name="tipoReferencia"][value="${recl.tipo_referencia}"]`).checked = true;
                toggleReferenciaFields();
            }
            
            if (recl.tipo_reclamacao) {
                document.querySelector(`input[name="tipoReclamacao"][value="${recl.tipo_reclamacao}"]`).checked = true;
                toggleCamposReclamacao();
            }
            
            onStatusChange();
        }
    } catch (error) {
        console.error('Erro ao carregar reclamação:', error);
    }
}

// ============================================
// SALVAR RECLAMAÇÃO COMPLETA
// ============================================
async function salvarReclamacaoCompleta() {
    const vendaId = document.getElementById('reclamacaoVendaId').value;
    const id = document.getElementById('reclamacaoId').value;
    const numeroReclamacao = document.getElementById('reclamacaoNumeroReclamacao').value.trim();
    const numeroOperacao = document.getElementById('reclamacaoNumeroOperacao').value.trim();
    const valor = parseFloat(document.getElementById('reclamacaoValor').value) || 0;
    const data = document.getElementById('reclamacaoData').value;
    const motivo = document.getElementById('reclamacaoMotivo').value;
    const status = document.getElementById('reclamacaoStatus').value;
    const observacoes = document.getElementById('reclamacaoObservacoes').value.trim();
    const justificativa = document.getElementById('reclamacaoJustificativa').value.trim();
    const numeroTransacao = document.getElementById('reclamacaoNumeroTransacao').value.trim();
    const tipoReferencia = document.querySelector('input[name="tipoReferencia"]:checked')?.value || 'venda';
    const tipoReclamacao = document.querySelector('input[name="tipoReclamacao"]:checked')?.value || 'com_reembolso';
    
    const nomeUsuario = getNomeUsuario();

    if (!vendaId) {
        showToast('Erro: venda não identificada', 'error');
        return;
    }

    if (!numeroReclamacao) {
        showToast('Número da reclamação é obrigatório', 'warning');
        return;
    }

    if (!data) {
        showToast('Data é obrigatória', 'warning');
        return;
    }

    if (!motivo) {
        showToast('Motivo é obrigatório', 'warning');
        return;
    }

    if (status === 'rejeitado' && !justificativa) {
        showToast('Justificativa é obrigatória para rejeição', 'warning');
        return;
    }

    if (status === 'resolvido' && !numeroTransacao) {
        showToast('Número da transação é obrigatório para resolução', 'warning');
        return;
    }

    const dados = {
        venda_id: vendaId,
        numero_reclamacao: numeroReclamacao,
        numero_operacao: numeroOperacao,
        protocolos: protocolosTemp,
        valor: valor,
        data_reclamacao: data,
        motivo: motivo,
        status: status,
        tipo_referencia: tipoReferencia,
        tipo_reclamacao: tipoReclamacao,
        observacoes: observacoes,
        justificativa_rejeicao: justificativa,
        numero_transacao: numeroTransacao,
        atualizado_em: new Date().toISOString(),
        atualizado_por: nomeUsuario
    };

    if (status === 'resolvido') {
        dados.resolvido_por = nomeUsuario;
        dados.data_resolucao = new Date().toISOString();
    }

    if (status === 'rejeitado') {
        dados.rejeitado_por = nomeUsuario;
        dados.data_rejeicao = new Date().toISOString();
    }

    try {
        if (!window.supabaseClient) {
            showToast('Erro: Supabase não conectado', 'error');
            return;
        }

        let result;
        let reclId = id;
        
        if (id) {
            result = await window.supabaseClient
                .from('reclamacoes_frete')
                .update(dados)
                .eq('id', id);
            
            if (result.error) throw result.error;
        } else {
            dados.criado_por = nomeUsuario;
            dados.criado_em = new Date().toISOString();
            
            const insertResult = await window.supabaseClient
                .from('reclamacoes_frete')
                .insert([dados])
                .select();
            
            if (insertResult.error) throw insertResult.error;
            reclId = insertResult.data?.[0]?.id;
        }

        if (status === 'resolvido' && tipoReclamacao === 'com_reembolso') {
            await criarReclamacaoNaAbaReembolsos(vendaId, dados, reclId);
        }

        showToast('✅ Reclamação salva com sucesso!', 'success');
        fecharModalReclamacaoCompleta();
        await carregarFretesSalvos();

    } catch (error) {
        console.error('Erro ao salvar reclamação:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
    }
}

// ============================================
// CRIAR RECLAMAÇÃO NA ABA REEMBOLSOS
// ============================================
async function criarReclamacaoNaAbaReembolsos(vendaId, dados, reclId) {
    try {
        if (!window.supabaseClient) return;
        
        const { data: existente } = await window.supabaseClient
            .from('reembolsos')
            .select('id')
            .eq('venda_id', vendaId)
            .maybeSingle();

        if (existente) {
            console.log('📋 Reclamação já existe na aba Reembolsos');
            return;
        }

        const nomeUsuario = getNomeUsuario();

        const dadosReembolso = {
            venda_id: vendaId,
            numero_venda: dados.numero_reclamacao || vendaId,
            numero_reclamacao: dados.numero_reclamacao,
            numero_operacao: dados.numero_operacao,
            valor: dados.valor || 0,
            data_reclamacao: dados.data_reclamacao || new Date().toISOString(),
            motivo: dados.motivo || 'Frete',
            status: 'a_verificar',
            tipo_referencia: dados.tipo_referencia || 'venda',
            tipo_reclamacao: dados.tipo_reclamacao || 'com_reembolso',
            observacoes: dados.observacoes || '',
            protocolos: dados.protocolos || [],
            numero_transacao: dados.numero_transacao || '',
            criado_por: nomeUsuario,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
            reclamacao_frete_id: reclId
        };

        const { error } = await window.supabaseClient
            .from('reembolsos')
            .insert([dadosReembolso]);

        if (error) throw error;

        console.log(`✅ Reclamação criada na aba Reembolsos para venda ${vendaId}`);

    } catch (error) {
        console.error('Erro ao criar reclamação na aba Reembolsos:', error);
    }
}

// ============================================
// VER HISTÓRICO DE RECLAMAÇÕES
// ============================================
async function verHistoricoReclamacoes(vendaId) {
    try {
        if (!window.supabaseClient) {
            showToast('Erro: Supabase não conectado', 'error');
            return;
        }
        
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('venda_id', vendaId)
            .order('criado_em', { ascending: false });
        
        if (error) throw error;
        if (!data || data.length === 0) {
            showToast('Nenhuma reclamação encontrada', 'info');
            return;
        }

        let html = `
            <div id="modalHistoricoReclamacao" class="modal" style="display: flex;">
                <div class="modal-content" style="max-width: 900px; max-height: 80vh; padding: 0; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #00ADEE, #80D6F7); color: white; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin:0;"><i class="fas fa-history"></i> Histórico de Reclamações</h3>
                        <button onclick="fecharModalHistoricoReclamacao()" style="background:none; border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
                    </div>
                    <div style="padding: 20px; max-height: 70vh; overflow-y: auto;">
                        <p><strong>Venda:</strong> ${vendaId}</p>
                        <div class="table-responsive">
                            <table class="table table-striped table-sm">
                                <thead>
                                    <tr>
                                        <th>Data</th>
                                        <th>Nº Reclamação</th>
                                        <th>Nº Operação</th>
                                        <th>Valor</th>
                                        <th>Motivo</th>
                                        <th>Status</th>
                                        <th>Protocolos</th>
                                        <th>Nº Transação</th>
                                        <th>Criado por</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.map(item => {
                                        const statusColors = {
                                            'aberto': 'warning',
                                            'em_andamento': 'info',
                                            'rejeitado': 'danger',
                                            'resolvido': 'success'
                                        };
                                        return `
                                            <tr>
                                                <td>${formatarDataISO(item.criado_em)}</td>
                                                <td>${item.numero_reclamacao || '-'}</td>
                                                <td>${item.numero_operacao || '-'}</td>
                                                <td>R$ ${(item.valor || 0).toFixed(2)}</td>
                                                <td>${item.motivo || '-'}</td>
                                                <td><span class="badge badge-${statusColors[item.status] || 'secondary'}">${item.status}</span></td>
                                                <td>${item.protocolos ? item.protocolos.join(', ') : '-'}</td>
                                                <td>${item.numero_transacao || '-'}</td>
                                                <td>${item.criado_por || '-'}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px 25px; border-top: 1px solid #dee2e6; display: flex; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="fecharModalHistoricoReclamacao()">Fechar</button>
                    </div>
                </div>
            </div>
        `;

        const modalAnterior = document.getElementById('modalHistoricoReclamacao');
        if (modalAnterior) modalAnterior.remove();
        
        document.body.insertAdjacentHTML('beforeend', html);

    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        showToast('Erro ao carregar histórico', 'error');
    }
}

function fecharModalHistoricoReclamacao() {
    document.getElementById('modalHistoricoReclamacao')?.remove();
}

// ============================================
// MUDAR STATUS DE REJEITADO PARA RESOLVIDO
// ============================================
async function mudarStatusReclamacao(id, novoStatus) {
    if (!confirm(`Deseja alterar o status para "${novoStatus}"?`)) return;

    try {
        if (!window.supabaseClient) {
            showToast('Erro: Supabase não conectado', 'error');
            return;
        }
        
        const nomeUsuario = getNomeUsuario();
        
        const { data: reclAtual } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('id', id)
            .single();

        const updateData = {
            status: novoStatus,
            atualizado_em: new Date().toISOString(),
            atualizado_por: nomeUsuario
        };

        if (novoStatus === 'resolvido') {
            updateData.resolvido_por = nomeUsuario;
            updateData.data_resolucao = new Date().toISOString();
            
            if (reclAtual && reclAtual.tipo_reclamacao === 'com_reembolso') {
                await criarReclamacaoNaAbaReembolsos(reclAtual.venda_id, reclAtual, id);
            }
        }

        const { error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        showToast(`✅ Status alterado para "${novoStatus}"`, 'success');
        carregarFretesSalvos();

    } catch (error) {
        console.error('Erro ao alterar status:', error);
        showToast('Erro ao alterar status: ' + error.message, 'error');
    }
}

// ============================================
// EDITAR RECLAMAÇÃO
// ============================================
async function editarReclamacao(id) {
    const recl = reclamacoesCache.find(r => r.id === id);
    if (!recl) {
        showToast('Reclamação não encontrada', 'error');
        return;
    }

    if (!window.supabaseClient) {
        showToast('Erro: Supabase não conectado', 'error');
        return;
    }

    const { data: venda } = await window.supabaseClient
        .from('fretes_ml')
        .select('*')
        .eq('id', recl.venda_id)
        .maybeSingle();

    const valorProduto = venda?.valor_produto || 0;
    const freteCobrado = venda?.frete_cobrado || 0;
    const freteEsperado = venda?.frete_esperado || 0;

    abrirModalReclamacaoCompleta(recl.venda_id, valorProduto, freteCobrado, freteEsperado);

    document.getElementById('reclamacaoId').value = recl.id;
    document.getElementById('reclamacaoNumeroReclamacao').value = recl.numero_reclamacao || '';
    document.getElementById('reclamacaoNumeroOperacao').value = recl.numero_operacao || '';
    document.getElementById('reclamacaoValor').value = recl.valor || 0;
    document.getElementById('reclamacaoData').value = recl.data_reclamacao ? recl.data_reclamacao.split('T')[0] : '';
    document.getElementById('reclamacaoMotivo').value = recl.motivo || '';
    document.getElementById('reclamacaoStatus').value = recl.status || 'aberto';
    document.getElementById('reclamacaoObservacoes').value = recl.observacoes || '';
    document.getElementById('reclamacaoJustificativa').value = recl.justificativa_rejeicao || '';
    document.getElementById('reclamacaoNumeroTransacao').value = recl.numero_transacao || '';
    
    if (recl.protocolos && recl.protocolos.length > 0) {
        protocolosTemp = recl.protocolos;
        renderizarProtocolos();
    }
    
    if (recl.tipo_referencia) {
        document.querySelector(`input[name="tipoReferencia"][value="${recl.tipo_referencia}"]`).checked = true;
        toggleReferenciaFields();
    }
    
    if (recl.tipo_reclamacao) {
        document.querySelector(`input[name="tipoReclamacao"][value="${recl.tipo_reclamacao}"]`).checked = true;
        toggleCamposReclamacao();
    }
    
    onStatusChange();
}

// ============================================
// FUNÇÃO AUXILIAR: VERIFICAR SE SHIPMENT É FULL
// ============================================
async function isShipmentFULL(shipmentId, token) {
    try {
        const shipUrl = `https://api.mercadolibre.com/shipments/${shipmentId}`;
        const shipProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
        const shipResp = await fetch(shipProxy);
        if (shipResp.ok) {
            const shipData = await shipResp.json();
            const logisticType = shipData.logistic_type || '';
            const tags = shipData.tags || [];
            const shippingMode = shipData.mode || '';
            
            const isFull = logisticType.toLowerCase().includes('full') ||
                   logisticType.toLowerCase().includes('fulfillment') ||
                   tags.some(t => t.toLowerCase().includes('full')) ||
                   tags.some(t => t.toLowerCase().includes('fulfillment')) ||
                   shippingMode.toLowerCase().includes('full');
            
            if (isFull) {
                console.log(`🔍 Shipment ${shipmentId} identificado como FULL`);
            }
            return isFull;
        }
        return false;
    } catch (e) {
        console.warn(`Erro ao verificar shipment ${shipmentId}:`, e.message);
        return false;
    }
}

function normalizarSkuFrete(valor) {
    const sku =
        String(
            valor ?? ''
        ).trim();

    if (
        !sku ||
        sku.toUpperCase() === 'N/A' ||
        sku.toUpperCase() === 'NULL' ||
        sku.toUpperCase() === 'UNDEFINED'
    ) {
        return null;
    }

    return sku;
}

function extrairSkuDeAtributosFrete(
    atributos
) {
    if (
        !Array.isArray(
            atributos
        )
    ) {
        return null;
    }

    const idsSku =
        new Set([
            'SELLER_SKU',
            'SELLER_CUSTOM_FIELD',
            'SKU'
        ]);

    const atributo =
        atributos.find(
            item =>
                idsSku.has(
                    String(
                        item?.id || ''
                    ).toUpperCase()
                )
        );

    return normalizarSkuFrete(
        atributo?.value_name ??
        atributo?.value_id ??
        atributo?.value
    );
}

function extrairSkuDiretoDaVenda(
    order
) {
    const orderItem =
        order?.order_items?.[0] ||
        null;

    const itemVenda =
        orderItem?.item ||
        {};

    /*
     * PRIORIDADE:
     *
     * primeiro procura o SKU que veio
     * registrado na própria venda.
     *
     * Isso é importante para anúncios
     * com variações.
     */
    const candidatos = [
        itemVenda.seller_custom_field,
        itemVenda.seller_sku,

        orderItem?.seller_custom_field,
        orderItem?.seller_sku,

        extrairSkuDeAtributosFrete(
            itemVenda.attributes
        ),

        extrairSkuDeAtributosFrete(
            orderItem?.attributes
        )
    ];

    for (
        const candidato
        of candidatos
    ) {
        const sku =
            normalizarSkuFrete(
                candidato
            );

        if (sku) {
            return sku;
        }
    }

    return null;
}

async function obterDadosProdutoVendaFrete(
    order,
    token
) {
    const orderItem =
        order?.order_items?.[0] ||
        null;

    const itemVenda =
        orderItem?.item ||
        {};

    const itemId =
        itemVenda?.id ||
        null;

    /*
     * Pega exatamente a variação
     * comprada na venda.
     */
    const variationId =
        itemVenda?.variation_id ??
        orderItem?.variation_id ??
        null;

    let titulo =
        itemVenda?.title ||
        orderItem?.title ||
        'Sem título';

    let mlbId =
        itemId ||
        'N/A';

    /*
     * PRIMEIRA TENTATIVA:
     * SKU diretamente da venda.
     */
    let sku =
        extrairSkuDiretoDaVenda(
            order
        );

    if (itemId) {
        try {
            const itemUrl =
                `https://api.mercadolibre.com/items/${itemId}`;

            const itemProxy =
                `${window.WORKER_URL}/api/ml/proxy` +
                `?url=${encodeURIComponent(itemUrl)}` +
                `&token=${encodeURIComponent(token)}`;

            const itemResp =
                await fetch(
                    itemProxy
                );

            if (itemResp.ok) {
                const itemData =
                    await itemResp.json();

                titulo =
                    itemData?.title ||
                    titulo;

                mlbId =
                    itemData?.id ||
                    itemId;

                /*
                 * SEGUNDA TENTATIVA:
                 *
                 * Se o SKU não veio diretamente
                 * na order, localiza a variation_id
                 * que foi realmente comprada.
                 */
                if (
                    !sku &&
                    variationId != null
                ) {
                    const variacao =
                        (
                            itemData?.variations ||
                            []
                        ).find(
                            item =>
                                String(
                                    item?.id
                                ) ===
                                String(
                                    variationId
                                )
                        );

                    if (variacao) {
                        sku =
                            normalizarSkuFrete(
                                variacao.seller_sku
                            ) ||

                            normalizarSkuFrete(
                                variacao.seller_custom_field
                            ) ||

                            extrairSkuDeAtributosFrete(
                                variacao.attributes
                            );
                    }
                }

                /*
                 * ÚLTIMO FALLBACK:
                 *
                 * Só usa o SKU geral do anúncio
                 * se realmente não houver SKU
                 * específico da venda/variação.
                 */
                if (!sku) {
                    sku =
                        normalizarSkuFrete(
                            itemData.seller_sku
                        ) ||

                        normalizarSkuFrete(
                            itemData.seller_custom_field
                        ) ||

                        extrairSkuDeAtributosFrete(
                            itemData.attributes
                        );
                }
            }

        } catch (error) {
            console.warn(
                `⚠️ Erro ao buscar dados do item ${itemId}:`,
                error.message
            );
        }
    }

    return {
        titulo:
            titulo ||
            'Sem título',

        sku:
            sku ||
            'N/A',

        mlbId:
            mlbId ||
            'N/A',

        variationId:
            variationId ??
            null
    };
}

async function corrigirSkuFreteSalvoPelaOrder(
    order,
    registroSalvo,
    token
) {
    if (
        !window.supabaseClient ||
        !order?.id ||
        !registroSalvo
    ) {
        return false;
    }

    /*
     * Primeiro tenta tirar diretamente
     * do pedido.
     */
    let skuVenda =
        extrairSkuDiretoDaVenda(
            order
        );

    /*
     * Se não veio na order, consulta
     * a variação correta.
     */
    if (
        !skuVenda &&
        token
    ) {
        const dadosProduto =
            await obterDadosProdutoVendaFrete(
                order,
                token
            );

        skuVenda =
            normalizarSkuFrete(
                dadosProduto.sku
            );
    }

    if (!skuVenda) {
        return false;
    }

    const skuAtual =
        normalizarSkuFrete(
            registroSalvo.sku
        );

    /*
     * Já está correto.
     */
    if (
        skuAtual === skuVenda
    ) {
        return false;
    }

    /*
     * Atualiza SOMENTE o SKU.
     *
     * Não mexe em peso,
     * dimensões, reclamações,
     * valor, frete etc.
     */
    const { error } =
        await window.supabaseClient
            .from('fretes_ml')
            .update({
                sku:
                    skuVenda,

                updated_at:
                    new Date()
                        .toISOString()
            })
            .eq(
                'id',
                String(
                    order.id
                )
            );

    if (error) {
        console.warn(
            `⚠️ Não foi possível corrigir o SKU da venda ${order.id}:`,
            error.message
        );

        return false;
    }

    console.log(
        `✅ SKU da venda ${order.id} corrigido: ` +
        `${skuAtual || 'N/A'} → ${skuVenda}`
    );

    return true;
}

async function buscarFretesML(limit = 200) {
    console.log(
        '🔍 Buscando fretes específicos do Mercado Livre (últimos 30 dias)...'
    );

    try {
        let token = null;

        if (
            window.mlTokenStatus &&
            window.mlTokenStatus.access_token
        ) {
            token =
                window.mlTokenStatus.access_token;

        } else if (
            typeof window.getValidToken ===
            'function'
        ) {
            const tokenData =
                await window.getValidToken();

            token =
                tokenData?.access_token;
        }

        if (!token) {
            const savedToken =
                localStorage.getItem(
                    'ml_access_token'
                );

            if (savedToken) {
                token =
                    savedToken;
            }
        }

        if (!token) {
            throw new Error(
                'Token ML não disponível. Faça login no Mercado Livre primeiro.'
            );
        }

        const dataInicio =
            new Date();

        dataInicio.setDate(
            dataInicio.getDate() -
            30
        );

        const dataFim =
            new Date();

        console.log(
            `📅 Buscando pedidos de ` +
            `${dataInicio.toLocaleDateString('pt-BR')} ` +
            `até ${dataFim.toLocaleDateString('pt-BR')}`
        );

        let idsSalvos =
            new Set();

        try {
            const {
                data: salvos,
                error: salvosError
            } =
                await window.supabaseClient
                    .from('fretes_ml')
                    .select('id')
                    .limit(10000);

            if (
                !salvosError &&
                salvos
            ) {
                idsSalvos =
                    new Set(
                        salvos.map(
                            item =>
                                String(
                                    item.id
                                )
                        )
                    );

                console.log(
                    `📋 ${idsSalvos.size} registros já salvos no banco`
                );
            }

        } catch (e) {
            console.warn(
                '⚠️ Erro ao buscar IDs salvos:',
                e.message
            );
        }

        let todasVendas = [];
        let offset = 0;
        let total = null;

        const maxLimit = 50;

        let vendasNovas = 0;
        let vendasJaSalvas = 0;
        let paginasBuscadas = 0;

        const MAX_PAGINAS = 20;

        while (
            (
                total === null ||
                offset < total
            ) &&
            paginasBuscadas <
                MAX_PAGINAS
        ) {
            const params =
                new URLSearchParams({
                    seller:
                        '415176739',

                    sort:
                        'date_desc',

                    'order.status':
                        'paid',

                    limit:
                        maxLimit,

                    offset:
                        offset,

                    'order.date_created.from':
                        dataInicio.toISOString(),

                    'order.date_created.to':
                        dataFim.toISOString()
                });

            const url =
                `https://api.mercadolibre.com/orders/search?${params}`;

            const proxyUrl =
                `${window.WORKER_URL}/api/ml/proxy` +
                `?url=${encodeURIComponent(url)}` +
                `&token=${encodeURIComponent(token)}`;

            console.log(
                `📡 Buscando pedidos (offset ${offset})...`
            );

            const response =
                await fetch(
                    proxyUrl
                );

            if (!response.ok) {
                let errorMsg =
                    `Erro na API: ${response.status}`;

                try {
                    const errorData =
                        await response.json();

                    if (
                        errorData.message
                    ) {
                        errorMsg +=
                            ` - ${errorData.message}`;
                    }

                } catch (e) {}

                throw new Error(
                    errorMsg
                );
            }

            const data =
                await response.json();

            const orders =
                data.results ||
                [];

            if (
                total === null
            ) {
                total =
                    data.paging?.total ||
                    0;

                console.log(
                    `📦 Total de pedidos encontrados: ${total}`
                );
            }

            paginasBuscadas++;

            console.log(
                `📦 ${orders.length} pedidos na página ${paginasBuscadas}`
            );

            const novasVendas =
                orders.filter(
                    order => {

                        const idVenda =
                            order.id
                                ?.toString();

                        if (
                            !idVenda ||
                            idsSalvos.has(
                                idVenda
                            )
                        ) {
                            return false;
                        }

                        const itemParaTeste = {
                            tipo_envio:
                                order.shipping?.mode ||
                                '',

                            informacoes_envio: {
                                tipo:
                                    order.shipping?.mode ||
                                    '',

                                logistic_type:
                                    order.shipping
                                        ?.logistic_type ||
                                    '',

                                fulfillment:
                                    order.shipping
                                        ?.fulfillment ||
                                    ''
                            },

                            tags:
                                order.tags ||
                                [],

                            titulo:
                                order.order_items?.[0]
                                    ?.item?.title ||
                                '',

                            id:
                                order.id
                        };

                        const isFull =
                            isFullByAnyField(
                                itemParaTeste
                            );

                        if (isFull) {
                            console.log(
                                `⏭️ Pedido ${idVenda} é FULL`
                            );

                            return false;
                        }

                        return true;
                    }
                );

            vendasNovas +=
                novasVendas.length;

            vendasJaSalvas +=
                orders.length -
                novasVendas.length;

            console.log(
                `📊 ${novasVendas.length} novas (não FULL), ` +
                `${orders.length - novasVendas.length} FULL ou já salvas`
            );

            todasVendas =
                todasVendas.concat(
                    novasVendas
                );

            offset +=
                maxLimit;

            if (
                novasVendas.length === 0 &&
                offset > maxLimit
            ) {
                console.log(
                    '🛑 Nenhuma venda nova encontrada, interrompendo busca...'
                );

                break;
            }

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        200
                    )
            );
        }

        console.log(
            `📦 Total de ${todasVendas.length} novas vendas coletadas (não FULL)`
        );

        if (
            todasVendas.length === 0
        ) {
            console.log(
                'ℹ️ Nenhuma venda nova para processar'
            );

            return {
                vendas: []
            };
        }

        const vendasProcessadas =
            [];

        let totalFullIgnorados = 0;
        let totalSemFrete = 0;
        let totalComFrete = 0;
        let totalErro = 0;

        const BATCH_SIZE = 50;

        for (
            let i = 0;
            i < todasVendas.length;
            i += BATCH_SIZE
        ) {
            const batch =
                todasVendas.slice(
                    i,
                    i + BATCH_SIZE
                );

            console.log(
                `📦 Processando lote ` +
                `${Math.floor(i / BATCH_SIZE) + 1}/` +
                `${Math.ceil(todasVendas.length / BATCH_SIZE)}...`
            );

            for (
                const order
                of batch
            ) {
                try {
                    const shippingMode =
                        order.shipping?.mode ||
                        '';

                    const logisticType =
                        order.shipping
                            ?.logistic_type ||
                        '';

                    const tags =
                        order.tags ||
                        [];

                    const fulfillment =
                        order.shipping
                            ?.fulfillment ||
                        '';

                    const informacoesEnvio = {
                        tipo:
                            shippingMode,

                        logistic_type:
                            logisticType,

                        fulfillment:
                            fulfillment,

                        mode:
                            shippingMode,

                        id:
                            order.shipping?.id ||
                            null,

                        receiver_cost:
                            order.shipping
                                ?.receiver_cost ??
                            null,

                        cost:
                            order.shipping?.cost ??
                            null,

                        tags:
                            tags,

                        status:
                            order.shipping?.status ||
                            null
                    };

                    const itemParaTeste = {
                        tipo_envio:
                            shippingMode,

                        informacoes_envio:
                            informacoesEnvio,

                        tags:
                            tags,

                        titulo:
                            order.order_items?.[0]
                                ?.item?.title ||
                            '',

                        id:
                            order.id
                    };

                    if (
                        isFullByAnyField(
                            itemParaTeste
                        )
                    ) {
                        totalFullIgnorados++;
                        continue;
                    }

                    let valorTotal = 0;

                    if (
                        order.order_items &&
                        order.order_items.length >
                            0
                    ) {
                        valorTotal =
                            order.order_items.reduce(
                                (
                                    soma,
                                    item
                                ) => {
                                    return (
                                        soma +
                                        (
                                            item.unit_price ||
                                            0
                                        ) *
                                        (
                                            item.quantity ||
                                            0
                                        )
                                    );
                                },
                                0
                            );
                    }

                    /*
                     * AQUI está a correção:
                     * não pega mais simplesmente
                     * o seller_sku geral do MLB.
                     */
                    const dadosProduto =
                        await obterDadosProdutoVendaFrete(
                            order,
                            token
                        );

                    const titulo =
                        dadosProduto.titulo;

                    const sku =
                        dadosProduto.sku;

                    const mlbId =
                        dadosProduto.mlbId;

                    const resultadoFrete =
                        await extrairFreteDaVenda(
                            order,
                            token
                        );

                    const freteCobrado =
                        resultadoFrete.frete;

                    if (
                        freteCobrado === 0 ||
                        freteCobrado < 0.5
                    ) {
                        totalSemFrete++;
                        continue;
                    }

                    totalComFrete++;

                    vendasProcessadas.push({
                        id_venda_ml:
                            order.id.toString(),

                        id:
                            order.id.toString(),

                        titulo:
                            titulo,

                        sku:
                            sku,

                        mlb_id:
                            mlbId,

                        valor_total:
                            valorTotal,

                        data_venda:
                            order.date_created ||
                            new Date()
                                .toISOString(),

                        tipo_envio:
                            shippingMode ||
                            'N/I',

                        status:
                            order.status,

                        frete_cobrado:
                            freteCobrado,

                        quantidade:
                            order.order_items?.[0]
                                ?.quantity ||
                            1,

                        fonte_frete:
                            resultadoFrete.fonte,

                        informacoes_envio:
                            informacoesEnvio,

                        tags:
                            tags,

                        is_full:
                            false
                    });

                } catch (e) {
                    console.warn(
                        `Erro ao processar pedido ${order.id}:`,
                        e.message
                    );

                    totalErro++;
                }
            }

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        200
                    )
            );
        }

        console.log(
            `✅ ${vendasProcessadas.length} novas vendas processadas (não FULL)`
        );

        console.log(
            `📊 Resumo: ` +
            `${totalFullIgnorados} FULL ignorados, ` +
            `${totalSemFrete} sem frete, ` +
            `${totalComFrete} com frete, ` +
            `${totalErro} com erro`
        );

        return {
            vendas:
                vendasProcessadas
        };

    } catch (error) {
        console.error(
            '❌ Erro ao buscar fretes do ML:',
            error
        );

        throw error;
    }
}

async function corrigirFreteSalvoPelaOrder(
    order,
    registroSalvo,
    token
) {
    if (
        !order?.id ||
        !registroSalvo ||
        !token ||
        !window.supabaseClient
    ) {
        return false;
    }

    const idVenda =
        String(
            order.id
        );

    try {
        /*
         * IMPORTANTE:
         *
         * extrairFreteDaVenda() consulta novamente:
         *
         * /shipments/{shipment_id}
         *
         * Portanto não dependemos mais do valor
         * antigo salvo no Supabase.
         */
        const resultado =
            await extrairFreteDaVenda(
                order,
                token
            );

        if (
            resultado.isFull
        ) {
            return false;
        }

        const novoFrete =
            Number(
                resultado.frete || 0
            );

        if (
            !Number.isFinite(
                novoFrete
            ) ||
            novoFrete <= 0
        ) {
            console.warn(
                `⚠️ Venda ${idVenda}: ` +
                `não foi possível obter custo da empresa.`
            );

            return false;
        }

        const freteAnterior =
            Number(
                registroSalvo
                    .frete_cobrado ||
                0
            );

        const quantidade =
            Math.max(
                1,

                parseInt(
                    registroSalvo
                        .quantidade ||
                    order.order_items?.[0]
                        ?.quantity ||
                    1
                ) ||
                1
            );

        /*
         * Usa o valor que já está salvo.
         * Não altera o valor do produto.
         */
        let valorProduto =
            Number(
                registroSalvo
                    .valor_produto ||
                0
            );

        if (
            !valorProduto &&
            Array.isArray(
                order.order_items
            )
        ) {
            valorProduto =
                order.order_items
                    .reduce(
                        (
                            total,
                            item
                        ) =>
                            total +
                            (
                                Number(
                                    item.unit_price
                                ) ||
                                0
                            ) *
                            (
                                Number(
                                    item.quantity
                                ) ||
                                0
                            ),
                        0
                    );
        }

        const peso =
            Number(
                registroSalvo
                    .peso_estimado ||
                0.3
            ) ||
            0.3;

        const dataVenda =
            registroSalvo
                .data_venda ||
            order.date_created ||
            new Date()
                .toISOString();

        const freteEsperado =
            calcularFreteEsperado(
                valorProduto,
                peso,
                dataVenda
            );

        const tipoEnvio =
            obterTipoEnvio(
                order,
                resultado
                    .informacoesEnvio
            );

        /*
         * Atualiza SOMENTE informações
         * relacionadas ao frete.
         */
        const dadosAtualizacao = {
            frete_cobrado:
                Number(
                    novoFrete.toFixed(2)
                ),

            frete_por_unidade:
                Number(
                    (
                        novoFrete /
                        quantidade
                    ).toFixed(2)
                ),

            frete_esperado:
                freteEsperado !==
                    null
                    ? Number(
                        freteEsperado
                            .toFixed(2)
                    )
                    : null,

            tipo_envio:
                tipoEnvio,

            /*
             * MUITO IMPORTANTE:
             *
             * salva novamente os dados COMPLETOS
             * do shipment, inclusive receiver_cost,
             * cost, list_cost e shipping_option.
             *
             * Assim o erro não volta depois de F5.
             */
            informacoes_envio:
                resultado
                    .informacoesEnvio,

            updated_at:
                new Date()
                    .toISOString()
        };

        const {
            error
        } =
            await window.supabaseClient
                .from(
                    'fretes_ml'
                )
                .update(
                    dadosAtualizacao
                )
                .eq(
                    'id',
                    idVenda
                );

        if (error) {
            throw error;
        }

        /*
         * Atualiza também o objeto
         * que está em memória.
         */
        Object.assign(
            registroSalvo,
            dadosAtualizacao
        );

        if (
            Math.abs(
                freteAnterior -
                novoFrete
            ) > 0.001
        ) {
            console.log(
                `✅ FRETE CORRIGIDO ${idVenda}: ` +
                `R$ ${freteAnterior.toFixed(2)} → ` +
                `R$ ${novoFrete.toFixed(2)}`
            );
        } else {
            console.log(
                `✅ Frete ${idVenda} conferido: ` +
                `R$ ${novoFrete.toFixed(2)}`
            );
        }

        return true;

    } catch (error) {
        console.warn(
            `⚠️ Erro ao corrigir frete da venda ${idVenda}:`,
            error
        );

        return false;
    }
}

async function buscarFretes() {
    console.log(
        '🔍 INICIANDO SINCRONIZAÇÃO DE FRETES...'
    );

    const tbody =
        document.getElementById(
            'shippingSimpleBody'
        );

    const btn =
        document.getElementById(
            'btnBuscarFretes'
        );

    if (!tbody) {
        return;
    }

    if (btn) {
        btn.disabled =
            true;

        btn.innerHTML =
            '<span class="spinner"></span> Sincronizando...';
    }

    tbody.innerHTML = `
        <tr>
            <td
                colspan="15"
                class="text-center"
            >
                <div class="spinner"></div>
                Buscando e conferindo vendas...
            </td>
        </tr>
    `;

    try {
        /*
         * ============================================
         * TOKEN
         * ============================================
         */

        let token =
            null;

        if (
            window.mlTokenStatus &&
            window.mlTokenStatus
                .access_token
        ) {
            token =
                window.mlTokenStatus
                    .access_token;

        } else if (
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
            token =
                localStorage
                    .getItem(
                        'ml_access_token'
                    );
        }

        if (!token) {
            throw new Error(
                'Token ML não disponível'
            );
        }

        /*
         * ============================================
         * 90 DIAS
         * ============================================
         *
         * Sua tela informa "últimos 90 dias".
         * Antes essa função buscava somente 30.
         */

        const dataInicio =
            new Date();

        dataInicio.setDate(
            dataInicio.getDate() -
            90
        );

        const dataFim =
            new Date();

        /*
         * ============================================
         * REGISTROS JÁ SALVOS
         * ============================================
         */

        let idsSalvos =
            new Set();

        let registrosSalvosMap =
            new Map();

        const {
            data: salvos,
            error: erroSalvos
        } =
            await window.supabaseClient
                .from(
                    'fretes_ml'
                )
                .select(`
                    id,
                    sku,
                    tipo_envio,
                    informacoes_envio,
                    frete_cobrado,
                    frete_esperado,
                    frete_por_unidade,
                    quantidade,
                    valor_produto,
                    peso_estimado,
                    data_venda
                `)
                .limit(
                    10000
                );

        if (
            erroSalvos
        ) {
            throw erroSalvos;
        }

        if (
            Array.isArray(
                salvos
            )
        ) {
            registrosSalvosMap =
                new Map(
                    salvos.map(
                        item => [
                            String(
                                item.id
                            ),
                            item
                        ]
                    )
                );

            /*
             * TODOS os IDs salvos.
             *
             * Eles NÃO serão inseridos novamente.
             *
             * Serão reprocessados pela função
             * corrigirFreteSalvoPelaOrder().
             */
            idsSalvos =
                new Set(
                    salvos.map(
                        item =>
                            String(
                                item.id
                            )
                    )
                );
        }

        console.log(
            `📂 ${idsSalvos.size} vendas já salvas serão conferidas`
        );

        /*
         * ============================================
         * BUSCAR ORDERS DO MERCADO LIVRE
         * ============================================
         */

        let todasVendasNovas =
            [];

        let offset =
            0;

        let total =
            null;

        let paginasBuscadas =
            0;

        /*
         * 40 páginas × 50 =
         * até 2.000 vendas.
         */
        const MAX_PAGINAS =
            40;

        let registrosReprocessados =
            0;

        let skusCorrigidos =
            0;

        while (
            (
                total === null ||
                offset < total
            ) &&
            paginasBuscadas <
                MAX_PAGINAS
        ) {
            const params =
                new URLSearchParams({
                    seller:
                        '415176739',

                    sort:
                        'date_desc',

                    'order.status':
                        'paid',

                    limit:
                        50,

                    offset:
                        offset,

                    'order.date_created.from':
                        dataInicio
                            .toISOString(),

                    'order.date_created.to':
                        dataFim
                            .toISOString()
                });

            const url =
                `https://api.mercadolibre.com/orders/search?${params}`;

            const proxyUrl =
                `${window.WORKER_URL}/api/ml/proxy` +
                `?url=${encodeURIComponent(url)}` +
                `&token=${encodeURIComponent(token)}`;

            console.log(
                `📡 Buscando vendas offset ${offset}...`
            );

            const response =
                await fetch(
                    proxyUrl
                );

            if (
                !response.ok
            ) {
                throw new Error(
                    `Erro na API: ${response.status}`
                );
            }

            const data =
                await response.json();

            const orders =
                data.results ||
                [];

            if (
                total === null
            ) {
                total =
                    data.paging
                        ?.total ||
                    0;

                console.log(
                    `📦 ${total} pedidos encontrados`
                );
            }

            paginasBuscadas++;

            /*
             * ============================================
             * PRIMEIRO: CORRIGIR VENDAS JÁ SALVAS
             * ============================================
             */

            const ordersExistentes =
                orders.filter(
                    order => {
                        const id =
                            order.id
                                ?.toString();

                        return (
                            id &&
                            registrosSalvosMap
                                .has(id)
                        );
                    }
                );

            /*
             * Processa em pequenos lotes para não
             * bombardear a API do ML.
             */
            const TAMANHO_LOTE =
                5;

            for (
                let i = 0;
                i <
                    ordersExistentes.length;
                i += TAMANHO_LOTE
            ) {
                const lote =
                    ordersExistentes
                        .slice(
                            i,
                            i +
                            TAMANHO_LOTE
                        );

                await Promise.all(
                    lote.map(
                        async order => {
                            const idVenda =
                                String(
                                    order.id
                                );

                            const registroSalvo =
                                registrosSalvosMap
                                    .get(
                                        idVenda
                                    );

                            if (
                                !registroSalvo
                            ) {
                                return;
                            }

                            /*
                             * CORRIGE SKU
                             */
                            try {
                                if (
                                    typeof
                                    corrigirSkuFreteSalvoPelaOrder ===
                                    'function'
                                ) {
                                    const corrigiuSku =
                                        await corrigirSkuFreteSalvoPelaOrder(
                                            order,
                                            registroSalvo,
                                            token
                                        );

                                    if (
                                        corrigiuSku
                                    ) {
                                        skusCorrigidos++;
                                    }
                                }

                            } catch (e) {
                                console.warn(
                                    `SKU ${idVenda}:`,
                                    e.message
                                );
                            }

                            /*
                             * CORRIGE FRETE
                             *
                             * ESSA É A PARTE NOVA.
                             */
                            const atualizado =
                                await corrigirFreteSalvoPelaOrder(
                                    order,
                                    registroSalvo,
                                    token
                                );

                            if (
                                atualizado
                            ) {
                                registrosReprocessados++;
                            }
                        }
                    )
                );

                /*
                 * Pequena pausa entre os lotes.
                 */
                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            150
                        )
                );
            }

            /*
             * ============================================
             * SEPARAR APENAS VENDAS REALMENTE NOVAS
             * ============================================
             */

            const novasVendas =
                orders.filter(
                    order => {
                        const idVenda =
                            order.id
                                ?.toString();

                        return (
                            idVenda &&
                            !idsSalvos.has(
                                idVenda
                            )
                        );
                    }
                );

            todasVendasNovas =
                todasVendasNovas.concat(
                    novasVendas
                );

            offset +=
                50;

            /*
             * IMPORTANTE:
             *
             * NÃO existe mais:
             *
             * if (novasVendas.length === 0) break
             *
             * porque precisamos continuar nas
             * páginas seguintes para corrigir
             * também as vendas antigas.
             */

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        150
                    )
            );
        }

        console.log(
            `✅ ${registrosReprocessados} registros existentes reprocessados`
        );

        console.log(
            `✅ ${skusCorrigidos} SKUs corrigidos`
        );

        console.log(
            `🆕 ${todasVendasNovas.length} vendas novas`
        );

        /*
         * ============================================
         * PROCESSAR VENDAS NOVAS
         * ============================================
         */

        const registrosParaInserir =
            [];

        let totalFull =
            0;

        let totalSemFrete =
            0;

        let totalIncorretos =
            0;

        let totalCorretos =
            0;

        let processados =
            0;

        for (
            const order
            of todasVendasNovas
        ) {
            processados++;

            if (
                processados %
                    20 ===
                0
            ) {
                tbody.innerHTML = `
                    <tr>
                        <td
                            colspan="15"
                            class="text-center"
                        >
                            <div class="spinner"></div>

                            Processando novas vendas
                            ${processados}/
                            ${todasVendasNovas.length}...
                        </td>
                    </tr>
                `;
            }

            try {
                const idVenda =
                    order.id
                        ?.toString();

                if (
                    !idVenda
                ) {
                    continue;
                }

                /*
                 * Consulta o SHIPMENT completo.
                 */
                const resultado =
                    await extrairFreteDaVenda(
                        order,
                        token
                    );

                if (
                    resultado.isFull
                ) {
                    totalFull++;
                    continue;
                }

                if (
                    !resultado.frete ||
                    resultado.frete <
                        0.5
                ) {
                    totalSemFrete++;
                    continue;
                }

                let valorTotal =
                    0;

                let quantidade =
                    1;

                if (
                    Array.isArray(
                        order.order_items
                    ) &&
                    order.order_items
                        .length >
                        0
                ) {
                    valorTotal =
                        order.order_items
                            .reduce(
                                (
                                    soma,
                                    item
                                ) =>
                                    soma +
                                    (
                                        Number(
                                            item.unit_price
                                        ) ||
                                        0
                                    ) *
                                    (
                                        Number(
                                            item.quantity
                                        ) ||
                                        0
                                    ),
                                0
                            );

                    quantidade =
                        order.order_items[0]
                            ?.quantity ||
                        1;
                }

                /*
                 * SKU correto da venda/variação.
                 */
                const dadosProduto =
                    await obterDadosProdutoVendaFrete(
                        order,
                        token
                    );

                const titulo =
                    dadosProduto
                        .titulo;

                const sku =
                    dadosProduto
                        .sku;

                const mlbId =
                    dadosProduto
                        .mlbId;

                let peso =
                    0.3;

                const medidas =
                    await buscarMedidasPorSKU(
                        sku
                    );

                if (
                    medidas
                ) {
                    peso =
                        medidas
                            .peso_kg ||
                        0.3;
                }

                const freteEsperado =
                    calcularFreteEsperado(
                        valorTotal,
                        peso,
                        order.date_created
                    );

                const isIncorreto =
                    freteEsperado !==
                        null &&
                    Math.abs(
                        resultado.frete -
                        freteEsperado
                    ) >
                        0.01;

                if (
                    isIncorreto
                ) {
                    totalIncorretos++;

                    const tipoEnvio =
                        obterTipoEnvio(
                            order,
                            resultado
                                .informacoesEnvio
                        );

                    registrosParaInserir
                        .push({
                            id:
                                idVenda,

                            titulo:
                                titulo ||
                                'Sem título',

                            mlb:
                                mlbId ||
                                'N/A',

                            sku:
                                sku ||
                                'N/A',

                            valor_produto:
                                Number(
                                    valorTotal
                                ) ||
                                0,

                            quantidade:
                                parseInt(
                                    quantidade
                                ) ||
                                1,

                            /*
                             * AQUI JÁ VEM SOMENTE
                             * O CUSTO DA EMPRESA.
                             */
                            frete_cobrado:
                                Number(
                                    resultado
                                        .frete
                                ) ||
                                0,

                            frete_esperado:
                                freteEsperado !==
                                    null
                                    ? Number(
                                        freteEsperado
                                    )
                                    : null,

                            frete_por_unidade:
                                Number(
                                    (
                                        resultado.frete /
                                        quantidade
                                    ).toFixed(2)
                                ),

                            data_venda:
                                order.date_created ||
                                new Date()
                                    .toISOString(),

                            tipo_envio:
                                tipoEnvio,

                            peso_estimado:
                                Number(
                                    peso
                                ) ||
                                0.3,

                            comprimento_cm:
                                22,

                            largura_cm:
                                16,

                            altura_cm:
                                1,

                            peso_volumetrico:
                                0.058,

                            informacoes_envio:
                                resultado
                                    .informacoesEnvio,

                            tags:
                                order.tags ||
                                [],

                            updated_at:
                                new Date()
                                    .toISOString()
                        });

                } else {
                    totalCorretos++;
                }

            } catch (error) {
                console.warn(
                    `⚠️ Venda ${order.id}:`,
                    error
                );
            }
        }

        /*
         * ============================================
         * SALVAR NOVAS
         * ============================================
         */

        if (
            registrosParaInserir
                .length >
            0
        ) {
            for (
                let i = 0;
                i <
                    registrosParaInserir
                        .length;
                i += 100
            ) {
                const chunk =
                    registrosParaInserir
                        .slice(
                            i,
                            i + 100
                        );

                const {
                    error:
                        erroSalvar
                } =
                    await window.supabaseClient
                        .from(
                            'fretes_ml'
                        )
                        .upsert(
                            chunk,
                            {
                                onConflict:
                                    'id'
                            }
                        );

                if (
                    erroSalvar
                ) {
                    throw erroSalvar;
                }
            }
        }

        /*
         * ============================================
         * RECARREGAR TABELA
         * ============================================
         */

        await carregarFretesSalvos();

        showToast(
            `✅ Fretes atualizados. ` +
            `${registrosReprocessados} existentes conferidos e ` +
            `${registrosParaInserir.length} novos salvos.`,
            'success'
        );

        console.log(
            '📊 SINCRONIZAÇÃO FINAL:',
            {
                existentesReprocessados:
                    registrosReprocessados,

                novosIncorretos:
                    totalIncorretos,

                novosCorretos:
                    totalCorretos,

                full:
                    totalFull,

                semFrete:
                    totalSemFrete
            }
        );

    } catch (error) {
        console.error(
            '❌ Erro:',
            error
        );

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="15"
                    class="text-center text-danger"
                >
                    Erro: ${error.message}
                </td>
            </tr>
        `;

        showToast(
            'Erro: ' +
            error.message,
            'error'
        );

    } finally {
        if (
            btn
        ) {
            btn.disabled =
                false;

            btn.innerHTML =
                '<i class="fas fa-sync-alt"></i> Buscar Fretes';
        }
    }
}

// ============================================
// FUNÇÕES DE RELATÓRIO COMPLETO
// ============================================
function abrirModalRelatorioReclamacoes() {
    console.log('📊 Abrindo relatório de reclamações...');
    
    let modal = document.getElementById('modalRelatorioFrete');
    if (!modal) {
        criarModalRelatorioCompleto();
        modal = document.getElementById('modalRelatorioFrete');
        if (!modal) {
            showToast('Erro ao criar modal de relatório', 'error');
            return;
        }
    }

    const hoje = new Date();
    const umMesAtras = new Date();
    umMesAtras.setDate(hoje.getDate() - 30);
    
    const dataInicio = document.getElementById('relDataInicio');
    const dataFim = document.getElementById('relDataFim');
    if (dataInicio) dataInicio.value = umMesAtras.toISOString().split('T')[0];
    if (dataFim) dataFim.value = hoje.toISOString().split('T')[0];
    
    carregarUsuariosFiltro();
    
    modal.classList.remove('hidden');
    gerarRelatorioCompleto();
}

function fecharModalRelatorio() {
    document.getElementById('modalRelatorioFrete').classList.add('hidden');
}

function criarModalRelatorioCompleto() {
    if (document.getElementById('modalRelatorioFrete')) return;

    const modalHTML = `
        <div id="modalRelatorioFrete" class="modal hidden">
            <div class="modal-content" style="max-width: 1200px; max-height: 95vh; padding: 0; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #fd7e14, #e8590c); color: white; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin:0;"><i class="fas fa-chart-bar"></i> Relatório de Reclamações de Frete</h3>
                    <button onclick="fecharModalRelatorio()" style="background: rgba(255,255,255,0.2); border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
                </div>
                
                <div style="padding: 20px; max-height: 85vh; overflow-y: auto;">
                    <div class="card mb-4">
                        <div class="card-header">
                            <h5><i class="fas fa-filter"></i> Filtros</h5>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="form-group">
                                        <label>Data Início</label>
                                        <input type="date" id="relDataInicio" class="form-control">
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="form-group">
                                        <label>Data Fim</label>
                                        <input type="date" id="relDataFim" class="form-control">
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="form-group">
                                        <label>Status</label>
                                        <select id="relStatus" class="form-control">
                                            <option value="">Todos</option>
                                            <option value="aberto">Aberto</option>
                                            <option value="em_andamento">Em andamento</option>
                                            <option value="rejeitado">Rejeitado</option>
                                            <option value="resolvido">Resolvido</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="form-group">
                                        <label>Usuário</label>
                                        <select id="relUsuario" class="form-control">
                                            <option value="">Todos</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="d-flex justify-content-end gap-2 mt-3">
                                <button onclick="gerarRelatorioCompleto()" class="btn btn-primary">
                                    <i class="fas fa-chart-bar"></i> Gerar Relatório
                                </button>
                                <button onclick="exportarRelatorioCompletoExcel()" class="btn btn-success">
                                    <i class="fas fa-file-excel"></i> Exportar Excel
                                </button>
                                <button onclick="imprimirRelatorioCompleto()" class="btn btn-info">
                                    <i class="fas fa-print"></i> Imprimir
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="row mb-4" id="relatorioResumo">
                        <div class="col-md-3">
                            <div class="card text-center bg-light">
                                <div class="card-body">
                                    <h5 class="card-title">Fretes Incorretos</h5>
                                    <h3 id="relTotalFretes">0</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-warning">
                                <div class="card-body">
                                    <h5 class="card-title">Reclamações Abertas</h5>
                                    <h3 id="relReclamacoesAbertas">0</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-success">
                                <div class="card-body">
                                    <h5 class="card-title">Resolvidas</h5>
                                    <h3 id="relReclamacoesResolvidas">0</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-danger">
                                <div class="card-body">
                                    <h5 class="card-title">Rejeitadas</h5>
                                    <h3 id="relReclamacoesRejeitadas">0</h3>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row mb-4">
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-chart-pie"></i> Distribuição por Status</h5>
                                </div>
                                <div class="card-body">
                                    <canvas id="graficoPizzaReclamacoes" height="250"></canvas>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-chart-bar"></i> Reclamações por Usuário</h5>
                                </div>
                                <div class="card-body">
                                    <canvas id="graficoBarrasReclamacoes" height="250"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row mb-4">
                        <div class="col-md-12">
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-chart-line"></i> Comparativo: Fretes Incorretos vs Reclamações</h5>
                                </div>
                                <div class="card-body">
                                    <canvas id="graficoComparativo" height="250"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5><i class="fas fa-list"></i> Histórico Detalhado</h5>
                            <span id="relTotalRegistros" class="badge badge-primary">0 registros</span>
                        </div>
                        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                            <table class="table table-striped table-sm" id="relatorioReclamacoesTable">
                                <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 10;">
                                    <tr>
                                        <th>Venda</th>
                                        <th>Data</th>
                                        <th>Nº Reclamação</th>
                                        <th>Nº Operação</th>
                                        <th>Nº Transação</th>
                                        <th>Valor</th>
                                        <th>Motivo</th>
                                        <th>Status</th>
                                        <th>Protocolos</th>
                                        <th>Criado por</th>
                                        <th>Atualizado por</th>
                                        <th>Data Alteração</th>
                                    </tr>
                                </thead>
                                <tbody id="relatorioReclamacoesBody">
                                    <tr><td colspan="12" class="text-center">Clique em "Gerar Relatório" para carregar dados.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);
}

// ============================================
// GERAR RELATÓRIO COMPLETO
// ============================================
async function gerarRelatorioCompleto() {
    const dataInicio = document.getElementById('relDataInicio').value;
    const dataFim = document.getElementById('relDataFim').value;
    const statusFiltro = document.getElementById('relStatus').value;
    const usuarioFiltro = document.getElementById('relUsuario').value;

    if (dataInicio && dataFim && new Date(dataInicio) > new Date(dataFim)) {
        showToast('Data início não pode ser maior que data fim', 'warning');
        return;
    }

    try {
        if (!window.supabaseClient) {
            showToast('Erro: Supabase não conectado', 'error');
            return;
        }

        let fretesQuery = window.supabaseClient
            .from('fretes_ml')
            .select('*');
        
        if (dataInicio && dataFim) {
            fretesQuery = fretesQuery
                .gte('data_venda', `${dataInicio}T00:00:00`)
                .lte('data_venda', `${dataFim}T23:59:59`);
        }
        
        const { data: fretes, error: fretesError } = await fretesQuery;
        if (fretesError) throw fretesError;

        const fretesIncorretos = (fretes || []).filter(item => {
            if (item.tipo_envio === 'FULL') return false;
            if (isFullByAnyField(item)) return false;
            if (!item.frete_cobrado || item.frete_cobrado <= 0) return false;
            const peso = item.peso_estimado || 0.3;
            const freteEsperado = calcularFreteEsperado(item.valor_produto, peso, item.data_venda);
            if (freteEsperado === null) return false;
            return Math.abs(item.frete_cobrado - freteEsperado) > 0.01;
        });

        let reclamacoesQuery = window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .order('criado_em', { ascending: false });
        
        if (dataInicio && dataFim) {
            reclamacoesQuery = reclamacoesQuery
                .gte('data_reclamacao', dataInicio)
                .lte('data_reclamacao', dataFim);
        }
        
        if (statusFiltro) {
            reclamacoesQuery = reclamacoesQuery.eq('status', statusFiltro);
        }
        
        if (usuarioFiltro) {
            reclamacoesQuery = reclamacoesQuery.eq('criado_por', usuarioFiltro);
        }
        
        const { data: reclamacoes, error: reclamacoesError } = await reclamacoesQuery;
        if (reclamacoesError) throw reclamacoesError;

        const abertas = reclamacoes.filter(r => r.status === 'aberto' || r.status === 'em_andamento').length;
        const resolvidas = reclamacoes.filter(r => r.status === 'resolvido').length;
        const rejeitadas = reclamacoes.filter(r => r.status === 'rejeitado').length;

        document.getElementById('relTotalFretes').textContent = fretesIncorretos.length;
        document.getElementById('relReclamacoesAbertas').textContent = abertas;
        document.getElementById('relReclamacoesResolvidas').textContent = resolvidas;
        document.getElementById('relReclamacoesRejeitadas').textContent = rejeitadas;
        document.getElementById('relTotalRegistros').textContent = `${reclamacoes.length} registros`;

        const tbody = document.getElementById('relatorioReclamacoesBody');
        tbody.innerHTML = '';

        if (reclamacoes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center">Nenhum dado encontrado.</td></tr>';
        } else {
            reclamacoes.forEach(item => {
                const statusColors = {
                    'aberto': 'warning',
                    'em_andamento': 'info',
                    'rejeitado': 'danger',
                    'resolvido': 'success'
                };
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${item.venda_id || '-'}</td>
                    <td>${formatarDataISO(item.data_reclamacao)}</td>
                    <td>${item.numero_reclamacao || '-'}</td>
                    <td>${item.numero_operacao || '-'}</td>
                    <td>${item.numero_transacao || '-'}</td>
                    <td>R$ ${(item.valor || 0).toFixed(2)}</td>
                    <td>${item.motivo || '-'}</td>
                    <td><span class="badge badge-${statusColors[item.status] || 'secondary'}">${item.status}</span></td>
                    <td>${item.protocolos ? item.protocolos.join(', ') : '-'}</td>
                    <td>${item.criado_por || '-'}</td>
                    <td>${item.atualizado_por || '-'}</td>
                    <td>${formatarDataISO(item.atualizado_em)}</td>
                `;
            });
        }

        atualizarGraficosRelatorioCompleto(fretesIncorretos, reclamacoes);

        showToast(`✅ Relatório gerado: ${reclamacoes.length} reclamações`, 'success');

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        showToast('Erro ao gerar relatório: ' + error.message, 'error');
    }
}

// ============================================
// ATUALIZAR GRÁFICOS DO RELATÓRIO
// ============================================
function atualizarGraficosRelatorioCompleto(fretes, reclamacoes) {
    // Gráfico Pizza
    const statusCount = {};
    reclamacoes.forEach(item => {
        statusCount[item.status] = (statusCount[item.status] || 0) + 1;
    });

    const ctxPizza = document.getElementById('graficoPizzaReclamacoes');
    if (ctxPizza) {
        if (window.graficoPizza) window.graficoPizza.destroy();
        
        const statusColors = {
            'aberto': '#ffc107',
            'em_andamento': '#17a2b8',
            'rejeitado': '#dc3545',
            'resolvido': '#28a745'
        };

        window.graficoPizza = new Chart(ctxPizza, {
            type: 'pie',
            data: {
                labels: Object.keys(statusCount),
                datasets: [{
                    data: Object.values(statusCount),
                    backgroundColor: Object.keys(statusCount).map(s => statusColors[s] || '#6c757d'),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // Gráfico Barras por Usuário
    const usuarioCount = {};
    reclamacoes.forEach(item => {
        const usuario = item.criado_por || 'Não identificado';
        usuarioCount[usuario] = (usuarioCount[usuario] || 0) + 1;
    });

    const ctxBarras = document.getElementById('graficoBarrasReclamacoes');
    if (ctxBarras) {
        if (window.graficoBarras) window.graficoBarras.destroy();
        
        const sortedUsers = Object.keys(usuarioCount).sort((a, b) => usuarioCount[b] - usuarioCount[a]);
        
        window.graficoBarras = new Chart(ctxBarras, {
            type: 'bar',
            data: {
                labels: sortedUsers,
                datasets: [{
                    label: 'Quantidade de Reclamações',
                    data: sortedUsers.map(u => usuarioCount[u]),
                    backgroundColor: 'rgba(0, 173, 238, 0.6)',
                    borderColor: '#00ADEE',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        stepSize: 1,
                        title: { display: true, text: 'Quantidade' }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // Gráfico Comparativo
    const meses = {};
    fretes.forEach(item => {
        if (item.data_venda) {
            const data = new Date(item.data_venda);
            const mesAno = `${data.getMonth()+1}/${data.getFullYear()}`;
            if (!meses[mesAno]) meses[mesAno] = { fretes: 0, reclamacoes: 0 };
            meses[mesAno].fretes++;
        }
    });
    
    reclamacoes.forEach(item => {
        if (item.data_reclamacao) {
            const data = new Date(item.data_reclamacao);
            const mesAno = `${data.getMonth()+1}/${data.getFullYear()}`;
            if (!meses[mesAno]) meses[mesAno] = { fretes: 0, reclamacoes: 0 };
            meses[mesAno].reclamacoes++;
        }
    });

    const ctxComparativo = document.getElementById('graficoComparativo');
    if (ctxComparativo) {
        if (window.graficoComparativo) window.graficoComparativo.destroy();
        
        const labels = Object.keys(meses).sort();
        const dadosFretes = labels.map(l => meses[l].fretes);
        const dadosReclamacoes = labels.map(l => meses[l].reclamacoes);
        
        window.graficoComparativo = new Chart(ctxComparativo, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Fretes Incorretos',
                        data: dadosFretes,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Reclamações',
                        data: dadosReclamacoes,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        stepSize: 1,
                        title: { display: true, text: 'Quantidade' }
                    }
                },
                plugins: { legend: { position: 'top' } }
            }
        });
    }
}

// ============================================
// EXPORTAR DADOS COMPLETOS (ATUALIZADO)
// ============================================
function exportarRelatorioCompletoExcel() {
    console.log('📊 Exportando TODOS os dados de fretes para Excel...');
    
    try {
        if (typeof XLSX === 'undefined') {
            showToast('❌ Biblioteca XLSX não carregada. Tente recarregar a página.', 'error');
            console.error('XLSX não definido');
            return;
        }

        const dadosParaExportar = fretesFiltrados;
        
        if (!dadosParaExportar || dadosParaExportar.length === 0) {
            showToast('Nenhum dado para exportar', 'warning');
            return;
        }

        console.log(`📊 Exportando ${dadosParaExportar.length} registros completos`);

        const dadosFormatados = dadosParaExportar.map(item => {
            // USAR DIMENSÕES SALVAS OU PADRÃO 22x16x1
            let comprimento = DEFAULT_DIMENSIONS.comprimento;
            let largura = DEFAULT_DIMENSIONS.largura;
            let altura = DEFAULT_DIMENSIONS.altura;
            
            // Se tiver medidas salvas no item, usa elas
            if (item.comprimento_cm && item.largura_cm && item.altura_cm) {
                comprimento = item.comprimento_cm;
                largura = item.largura_cm;
                altura = item.altura_cm;
            }
            
            const peso = item.peso_estimado || 0.3;
            const freteEsperado = calcularFreteEsperado(item.valor_produto, peso, item.data_venda);
            const diferenca = (item.frete_cobrado || 0) - (freteEsperado || 0);
            
            let status = 'Não calculado';
            if (freteEsperado !== null) {
                const diffAbs = Math.abs(diferenca);
                if (diffAbs < 0.01) {
                    status = '✅ Correto';
                } else if (diferenca > 0) {
                    status = `❌ Acima (R$ ${diferenca.toFixed(2)})`;
                } else {
                    status = `⚠️ Abaixo (R$ ${Math.abs(diferenca).toFixed(2)})`;
                }
            }

            let reclamacaoStatus = 'Nenhuma';
            if (item.temReclamacaoAberta) reclamacaoStatus = 'Em andamento';
            else if (item.temReclamacaoRejeitada) reclamacaoStatus = 'Rejeitada';
            else if (item.temReclamacaoResolvida) reclamacaoStatus = 'Resolvida';

            const pesoVol = calcularPesoVolumetrico(comprimento, largura, altura);

            return {
                'Venda': item.id || '',
                'Título': item.titulo || 'Sem título',
                'SKU': item.sku || 'N/A',
                'MLB': item.mlb || 'N/A',
                'Valor (R$)': parseFloat(item.valor_produto || 0).toFixed(2),
                'Quantidade': item.quantidade || 1,
                'Frete Cobrado (R$)': parseFloat(item.frete_cobrado || 0).toFixed(2),
                'Frete Esperado (R$)': freteEsperado !== null ? freteEsperado.toFixed(2) : 'N/A',
                'Diferença (R$)': diferenca !== 0 ? diferenca.toFixed(2) : '0,00',
                'Status': status,
                'Reclamação': reclamacaoStatus,
                'Peso (kg)': peso.toFixed(3),
                'Dimensões (CxLxA)': `${comprimento}x${largura}x${altura}cm`,
                'Peso Volumétrico (m³)': pesoVol.toFixed(4),
                'Data Venda': item.data_venda ? new Date(item.data_venda).toLocaleDateString('pt-BR') : '-',
                'Fonte Frete': item.fonte_frete || 'N/A',
                'Nº Reclamação': item.ultimaReclamacao?.numero_reclamacao || '',
                'Nº Operação': item.ultimaReclamacao?.numero_operacao || '',
                'Protocolos': item.ultimaReclamacao?.protocolos?.join('; ') || ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(dadosFormatados);
        const colWidths = [];
        const maxCols = dadosFormatados.length > 0 ? Object.keys(dadosFormatados[0]).length : 0;
        for (let i = 0; i < maxCols; i++) {
            colWidths.push({ wch: 20 });
        }
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Fretes');

        // Resumo
        const resumoData = [
            ['RELATÓRIO DE FRETES INCORRETOS'],
            [''],
            ['Total de registros', dadosFormatados.length],
            ['Data de exportação', new Date().toLocaleString('pt-BR')],
            ['Dimensão padrão', '22x16x1cm'],
            [''],
            ['RESUMO POR STATUS'],
            ['Status', 'Quantidade']
        ];

        let totalAcima = 0, totalAbaixo = 0, totalCorreto = 0;
        dadosFormatados.forEach(item => {
            const status = item['Status'] || '';
            if (status.includes('Acima')) totalAcima++;
            else if (status.includes('Abaixo')) totalAbaixo++;
            else if (status.includes('Correto')) totalCorreto++;
        });

        resumoData.push(['✅ Correto', totalCorreto]);
        resumoData.push(['❌ Acima', totalAcima]);
        resumoData.push(['⚠️ Abaixo', totalAbaixo]);
        resumoData.push(['Total', totalCorreto + totalAcima + totalAbaixo]);

        const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
        wsResumo['!cols'] = [{ wch: 30 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

        const dataAtual = new Date().toISOString().split('T')[0];
        const nomeArquivo = `fretes_completos_${dataAtual}.xlsx`;
        
        XLSX.writeFile(wb, nomeArquivo);
        
        showToast(`✅ ${dadosFormatados.length} registros exportados com sucesso!`, 'success');
        console.log(`✅ Arquivo "${nomeArquivo}" salvo com ${dadosFormatados.length} registros`);
        
    } catch (error) {
        console.error('❌ Erro ao exportar:', error);
        showToast('Erro ao exportar: ' + error.message, 'error');
    }
}

// ============================================
// IMPRIMIR RELATÓRIO
// ============================================
function imprimirRelatorioCompleto() {
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    const hoje = new Date().toLocaleDateString('pt-BR');
    const nomeUsuario = getNomeUsuario();
    
    const dataInicio = document.getElementById('relDataInicio').value || '-';
    const dataFim = document.getElementById('relDataFim').value || '-';
    
    const totalFretes = document.getElementById('relTotalFretes').textContent;
    const abertas = document.getElementById('relReclamacoesAbertas').textContent;
    const resolvidas = document.getElementById('relReclamacoesResolvidas').textContent;
    const rejeitadas = document.getElementById('relReclamacoesRejeitadas').textContent;

    const tbody = document.getElementById('relatorioReclamacoesBody');
    let tabelaHTML = '';
    tbody.querySelectorAll('tr').forEach(row => {
        tabelaHTML += '<tr>';
        row.querySelectorAll('td').forEach(cell => {
            tabelaHTML += `<td>${cell.textContent}</td>`;
        });
        tabelaHTML += '</tr>';
    });

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Relatório de Reclamações de Frete</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                .resumo { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
                .resumo-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; flex: 1; min-width: 150px; }
                .resumo-card h3 { margin: 0; font-size: 24px; }
                .resumo-card p { margin: 5px 0 0; color: #6c757d; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
                th { background: #00ADEE; color: white; padding: 8px; text-align: left; }
                td { padding: 6px; border-bottom: 1px solid #ddd; }
                .badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; }
                .badge-warning { background: #ffc107; }
                .badge-info { background: #17a2b8; color: white; }
                .badge-danger { background: #dc3545; color: white; }
                .badge-success { background: #28a745; color: white; }
                .badge-secondary { background: #6c757d; color: white; }
                @media print {
                    body { margin: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>📊 Relatório de Reclamações de Frete</h1>
            <p><strong>Período:</strong> ${dataInicio} a ${dataFim}</p>
            <p><strong>Gerado em:</strong> ${hoje}</p>
            <p><strong>Gerado por:</strong> ${nomeUsuario}</p>
            
            <div class="resumo">
                <div class="resumo-card" style="background:#e9ecef;">
                    <h3>${totalFretes}</h3>
                    <p>Fretes Incorretos</p>
                </div>
                <div class="resumo-card" style="background:#fff3cd;">
                    <h3>${abertas}</h3>
                    <p>Reclamações Abertas</p>
                </div>
                <div class="resumo-card" style="background:#d4edda;">
                    <h3>${resolvidas}</h3>
                    <p>Resolvidas</p>
                </div>
                <div class="resumo-card" style="background:#f8d7da;">
                    <h3>${rejeitadas}</h3>
                    <p>Rejeitadas</p>
                </div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Venda</th>
                        <th>Data</th>
                        <th>Nº Reclamação</th>
                        <th>Nº Operação</th>
                        <th>Nº Transação</th>
                        <th>Valor</th>
                        <th>Motivo</th>
                        <th>Status</th>
                        <th>Protocolos</th>
                        <th>Criado por</th>
                        <th>Atualizado por</th>
                        <th>Data Alteração</th>
                    </tr>
                </thead>
                <tbody>
                    ${tabelaHTML || '<tr><td colspan="12" class="text-center">Nenhum dado encontrado.</td></tr>'}
                </tbody>
            </table>
            
            <div class="no-print" style="margin-top: 30px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #00ADEE; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    <i class="fas fa-print"></i> Imprimir
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">
                    Fechar
                </button>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 1500);
                };
                window.onafterprint = function() {
                    setTimeout(function() {
                        window.close();
                    }, 1000);
                };
            <\/script>
        </body>
        </html>
    `);
    
    printWindow.document.close();
}
function calcularFreteEsperado(
    valorProduto,
    peso,
    dataVenda = null
) {
    const pesoArredondado =
        Math.round(
            parseFloat(peso) * 100
        ) / 100;

    const valor =
        parseFloat(valorProduto);

    if (
        isNaN(valor) ||
        isNaN(pesoArredondado) ||
        pesoArredondado <= 0
    ) {
        return null;
    }

    const tabelaVigente =
        obterTabelaFreteVigente(
            dataVenda
        );

    for (
        const faixa of tabelaVigente
    ) {
        const pesoCompativel =
            pesoArredondado >=
                parseFloat(
                    faixa.weightMin
                ) &&

            pesoArredondado <=
                parseFloat(
                    faixa.weightMax
                );

        const valorCompativel =
            valor >=
                parseFloat(
                    faixa.priceMin
                ) &&

            valor <=
                parseFloat(
                    faixa.priceMax
                );

        if (
            pesoCompativel &&
            valorCompativel
        ) {
            return parseFloat(
                faixa.cost
            );
        }
    }

    return null;
}

// ============================================
// CARREGAR USUÁRIOS PARA FILTRO
// ============================================
async function carregarUsuariosFiltro() {
    try {
        if (!window.supabaseClient) return;
        
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('criado_por')
            .not('criado_por', 'is', null);
        
        if (error) throw error;
        
        const usuarios = [...new Set(data.map(item => item.criado_por).filter(Boolean))].sort();
        const select = document.getElementById('relUsuario');
        if (select) {
            select.innerHTML = '<option value="">Todos</option>';
            usuarios.forEach(user => {
                select.innerHTML += `<option value="${user}">${user}</option>`;
            });
        }
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
    }
}

document.addEventListener(
    'DOMContentLoaded',
    function() {
        console.log(
            '🚀 Inicializando sistema ' +
            'de reclamações de frete...'
        );

        const btnBuscar =
            document.getElementById(
                'btnBuscarFretes'
            );

        if (btnBuscar) {
            const novoBtnBuscar =
                btnBuscar.cloneNode(true);

            btnBuscar.parentNode
                .replaceChild(
                    novoBtnBuscar,
                    btnBuscar
                );

            novoBtnBuscar
                .addEventListener(
                    'click',
                    function(evento) {
                        evento.preventDefault();

                        buscarFretes();
                    }
                );
        }

        const btnAnterior =
            document.getElementById(
                'btnFretesAnterior'
            );

        if (btnAnterior) {
            btnAnterior.removeAttribute(
                'onclick'
            );

            const novoAnterior =
                btnAnterior.cloneNode(true);

            btnAnterior.parentNode
                .replaceChild(
                    novoAnterior,
                    btnAnterior
                );

            novoAnterior
                .addEventListener(
                    'click',
                    function(evento) {
                        evento.preventDefault();

                        paginaFretesAnterior();
                    }
                );
        }

        const btnProxima =
            document.getElementById(
                'btnFretesProxima'
            );

        if (btnProxima) {
            btnProxima.removeAttribute(
                'onclick'
            );

            const novaProxima =
                btnProxima.cloneNode(true);

            btnProxima.parentNode
                .replaceChild(
                    novaProxima,
                    btnProxima
                );

            novaProxima
                .addEventListener(
                    'click',
                    function(evento) {
                        evento.preventDefault();

                        paginaFretesProxima();
                    }
                );
        }

        document
            .querySelectorAll(
                '.btn-filtro-reclamacao'
            )
            .forEach(btn => {
                const novoBtn =
                    btn.cloneNode(true);

                btn.parentNode
                    .replaceChild(
                        novoBtn,
                        btn
                    );

                novoBtn
                    .addEventListener(
                        'click',
                        function() {
                            const status =
                                this.dataset.status;

                            if (status) {
                                filtrarReclamacoes(
                                    status
                                );
                            }
                        }
                    );
            });

        if (
            document.getElementById(
                'shippingSimpleBody'
            )
        ) {
            setTimeout(
                async function() {
                    await carregarTabelasFreteHistoricas();
                    await carregarFretesSalvos();
                },
                200
            );
        }

        console.log(
            '✅ Sistema de frete inicializado'
        );
    }
);

// ============================================
// EXPORTAÇÕES GLOBAIS - TODAS AS FUNÇÕES EXPORTADAS
// ============================================
window.carregarFretesSalvos = carregarFretesSalvos;
window.buscarFretes = buscarFretes;
window.buscarFretesML = buscarFretesML;
window.salvarMedidasERecalcular = salvarMedidasERecalcular;
window.calcularFreteEsperado = calcularFreteEsperado;
window.calcularPesoVolumetrico = calcularPesoVolumetrico;
window.paginaFretesAnterior = paginaFretesAnterior;
window.paginaFretesProxima = paginaFretesProxima;
window.filtrarReclamacoes = filtrarReclamacoes;
window.mudarStatusReclamacao = mudarStatusReclamacao;
window.abrirModalRelatorioReclamacoes = abrirModalRelatorioReclamacoes;
window.fecharModalRelatorio = fecharModalRelatorio;
window.gerarRelatorioCompleto = gerarRelatorioCompleto;
window.exportarRelatorioCompletoExcel = exportarRelatorioCompletoExcel;
window.imprimirRelatorioCompleto = imprimirRelatorioCompleto;
window.abrirModalReclamacaoCompleta = abrirModalReclamacaoCompleta;
window.fecharModalReclamacaoCompleta = fecharModalReclamacaoCompleta;
window.salvarReclamacaoCompleta = salvarReclamacaoCompleta;
window.adicionarProtocolo = adicionarProtocolo;
window.removerProtocolo = removerProtocolo;
window.onStatusChange = onStatusChange;
window.toggleReferenciaFields = toggleReferenciaFields;
window.toggleCamposReclamacao = toggleCamposReclamacao;
window.criarModalReclamacaoCompleta = criarModalReclamacaoCompleta;
window.verHistoricoReclamacoes = verHistoricoReclamacoes;
window.editarReclamacao = editarReclamacao;
window.carregarUsuariosFiltro = carregarUsuariosFiltro;
window.isFullByAnyField = isFullByAnyField;
window.isShipmentFULL = isShipmentFULL;
window.importarTabelaFreteDoLink = importarTabelaFreteDoLink;
window.carregarTabelasFreteHistoricas = carregarTabelasFreteHistoricas;
window.filtrarFretesBusca = filtrarFretesBusca;
window.limparBuscaFretes = limparBuscaFretes;
window.aplicarFiltrosFretes = aplicarFiltrosFretes;

console.log('✅ shipping_simple.js v4.6 - Todas as funções exportadas');