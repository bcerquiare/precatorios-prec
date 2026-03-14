import { extrairDadosDataJud } from './services/datajud/extrair-dados-datajud.js';
import { ExecutarTJSP } from './services/tjsp/executar-tjsp.js';
import { extrairConteudoPdf } from './services/tjsp/extrair-conteudo-pdf.js';
import { extrairDadosDoESAJ } from './services/tjsp/extrair-dados-esaj.js';
import { extrairDadosPrecatorioDoTextoPDF } from './services/tjsp/extrair-dados-precatorio.js';
import { IniciarSessaoNoTJSP } from './services/tjsp/iniciar-sessao-tjsp.js';
import { executarWorkflowTJSP } from './workflow/workflow-executar-entidade-tjsp.js';

async function mainOld() {

    //const r = await extrairDadosDataJud('1000570-88.2017.8.26.0481')
    //console.log(JSON.stringify(r, null, 2))
    //return;

    const x = await extrairDadosDoESAJ('0001068-64.2020.8.26.0428')
    console.log(x)
    return;

  const sessao = await IniciarSessaoNoTJSP();
  const entidades = sessao.entidades;
  const entidade = entidades.find(x => x.id === '427'); // paulinia

  if( !entidade ){
    console.error('Entidade não encontrada');
    return;
  }

  //console.log(`Iniciando download para a entidade ${entidade.id} - ${entidade.name}...`);

    try {
      const pdf = await ExecutarTJSP(sessao, entidade?.id ?? '');
      console.log(`PDF baixado com sucesso: ${pdf.buffer.byteLength} bytes.`);
      const texto = await extrairConteudoPdf(pdf.path);
      const dados = await extrairDadosPrecatorioDoTextoPDF(texto);
      //
      console.log(texto)
      console.log(dados.splice(0, 5));

    } catch (error) {
      //console.error(`Erro ao baixar PDF para a entidade ${entidade.id}:`, error);
    }

}

async function main() {

  const sessao = await IniciarSessaoNoTJSP();
  const entidades = sessao.entidades;
  //const entidade = entidades.find(x => x.id === '427'); // paulinia
  const entidade = entidades.find(x => x.id === '174'); // CAIUÁ

  if( !entidade ){
    console.error('Entidade não encontrada');
    return;
  }

    try {

        const dados = await executarWorkflowTJSP(entidade.id);
        console.dir(dados, { depth: null , maxArrayLength: null });


    } catch (error) {
      console.error(`Erro ao baixar PDF para a entidade ${entidade.id}:`, error);
    }

}

main();
