// api.js
export async function enviarParaPlanilha(dadosOS) {
  const urlAppsScript = 'https://script.google.com/macros/s/SUA_URL_AQUI/exec';
  
  try {
    const response = await fetch(urlAppsScript, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        os: dadosOS,
        operacao: 'criar' // ou 'atualizar'
      })
    });
    
    const resultado = await response.json();
    console.log('✅ Resposta da API:', resultado);
    return resultado;
    
  } catch (error) {
    console.error('❌ Erro ao enviar:', error);
    return { success: false, error: error.message };
  }
}
