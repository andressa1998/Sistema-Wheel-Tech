const { XMLBuilder } = require('fast-xml-parser');

function buildNFeXML(venda) {
    // Extrair dados da venda
    const cliente = {
        cnpj: venda.cliente_cnpj,
        nome: venda.cliente_nome,
        endereco: venda.cliente_endereco,
        cidade: venda.cliente_cidade,
        uf: venda.cliente_uf,
        cep: venda.cliente_cep,
        telefone: venda.cliente_telefone,
        email: venda.cliente_email
    };

    const produtos = venda.produtos.map(p => ({
        nItem: p.item,
        codProd: p.codigo,
        descProd: p.descricao,
        qCom: p.quantidade,
        uCom: p.unidade,
        vUnCom: p.valor_unitario,
        vProd: p.valor_total,
        indTot: '1' // item soma ao total
    }));

    // Montar o XML conforme padrão da NF-e
    const infNFe = {
        '@_versao': '4.00',
        '@_Id': `NFe${venda.chave}`,
        ide: {
            cUF: getCUF(venda.cliente_uf),
            cNF: venda.cNF, // 8 dígitos aleatórios
            natOp: 'Venda',
            mod: '55',
            serie: '1',
            nNF: venda.numero_nf,
            dhEmi: new Date().toISOString(),
            tpNF: '1', // 1=saída
            idDest: '1', // 1=oper interna
            cMunFG: venda.cod_municipio,
            tpImp: '1', // 1=retrato
            tpEmis: '1', // 1=normal
            cDV: venda.dv_chave,
            tpAmb: '2', // 2=homologação, 1=produção
            finNFe: '1', // 1=normal
            indFinal: '1', // 1=consumidor final
            indPres: '1', // 1=presencial
            procEmi: '0', // 0=software próprio
            verProc: '1.0'
        },
        emit: {
            CNPJ: venda.emitente_cnpj,
            xNome: venda.emitente_nome,
            xFant: venda.emitente_fantasia,
            enderEmit: {
                xLgr: venda.emitente_logradouro,
                nro: venda.emitente_numero,
                xBairro: venda.emitente_bairro,
                cMun: venda.emitente_cod_municipio,
                xMun: venda.emitente_municipio,
                UF: venda.emitente_uf,
                CEP: venda.emitente_cep,
                cPais: '1058', // Brasil
                xPais: 'BRASIL'
            },
            IE: venda.emitente_ie,
            CRT: '1' // 1=Simples Nacional
        },
        dest: {
            CNPJ: cliente.cnpj,
            xNome: cliente.nome,
            enderDest: {
                xLgr: cliente.endereco,
                nro: cliente.numero,
                xBairro: cliente.bairro,
                cMun: cliente.cod_municipio,
                xMun: cliente.cidade,
                UF: cliente.uf,
                CEP: cliente.cep,
                cPais: '1058',
                xPais: 'BRASIL'
            },
            indIEDest: '9', // 9=não contribuinte
            email: cliente.email
        },
        det: produtos,
        total: {
            ICMSTot: {
                vBC: venda.base_calculo,
                vICMS: venda.valor_icms,
                vICMSDeson: '0',
                vFCP: '0',
                vBCST: '0',
                vST: '0',
                vFCPST: '0',
                vFCPSTRet: '0',
                vProd: venda.valor_total_produtos,
                vFrete: '0',
                vSeg: '0',
                vDesc: venda.valor_desconto,
                vII: '0',
                vIPI: '0',
                vIPIDevol: '0',
                vPIS: '0',
                vCOFINS: '0',
                vOutro: '0',
                vNF: venda.valor_total_nf
            }
        },
        transp: {
            modFrete: '0' // 0=por conta do emitente
        },
        pag: {
            detPag: {
                tPag: '01', // dinheiro
                vPag: venda.valor_total_nf
            }
        }
    };

    const nfe = {
        NFe: {
            '@_xmlns': 'http://www.portalfiscal.inf.br/nfe',
            infNFe: infNFe
        }
    };

    const builder = new XMLBuilder({ format: true });
    return builder.build(nfe);
}

function getCUF(uf) {
    const tabela = {
        'AC': 12, 'AL': 27, 'AP': 16, 'AM': 13, 'BA': 29, 'CE': 23, 'DF': 53,
        'ES': 32, 'GO': 52, 'MA': 21, 'MT': 51, 'MS': 50, 'MG': 31, 'PA': 15,
        'PB': 25, 'PR': 41, 'PE': 26, 'PI': 22, 'RJ': 33, 'RN': 24, 'RS': 43,
        'RO': 11, 'RR': 14, 'SC': 42, 'SP': 35, 'SE': 28, 'TO': 17
    };
    return tabela[uf] || 35;
}

module.exports = { buildNFeXML };