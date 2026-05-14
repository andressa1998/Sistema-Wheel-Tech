function montarEnvioNFe(xmlAssinado) {

    // remove declaração XML se existir
    xmlAssinado = xmlAssinado
        .replace('<?xml version="1.0" encoding="UTF-8"?>', '')
        .trim();

    // -----------------------------
    // ENVINFE
    // -----------------------------

    const enviNFe = `
<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <idLote>1</idLote>
    <indSinc>1</indSinc>

    ${xmlAssinado}

</enviNFe>`.trim();

    // -----------------------------
    // SOAP
    // -----------------------------

    const soap = `<?xml version="1.0" encoding="utf-8"?>

<soap12:Envelope
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
 xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">

    <soap12:Body>

        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">

            ${enviNFe}

        </nfeDadosMsg>

    </soap12:Body>

</soap12:Envelope>`;

    return soap;
}

module.exports = {
    montarEnvioNFe
};