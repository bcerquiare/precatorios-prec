import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extrairDadosDataJud } from '../services/datajud/extrair-dados-datajud.js';
import { consolidarDadosExtraidosTjsp, PrecatorioConsolidado } from '../services/tjsp/consolidar-dados-extraidos-tjsp.js';
import { ExecutarTJSP } from '../services/tjsp/executar-tjsp.js';
import { extrairConteudoPdf } from '../services/tjsp/extrair-conteudo-pdf.js';
import { extrairDadosDoESAJ } from '../services/tjsp/extrair-dados-esaj.js';
import { extrairDadosPrecatorioDoTextoPDF } from '../services/tjsp/extrair-dados-precatorio.js';
import { IniciarSessaoNoTJSP } from '../services/tjsp/iniciar-sessao-tjsp.js';
import { sleep } from '../libs/sleep.js';

export async function executarWorkflowTJSP(entidadeId: string): Promise<PrecatorioConsolidado[]> {
  console.log(`[workflow] Iniciando para entidade ${entidadeId}`);

  console.log(`[workflow] Iniciando sessão no TJSP...`);
  const sessao = await IniciarSessaoNoTJSP();
  console.log(`[workflow] Sessão iniciada. ${sessao.entidades.length} entidades disponíveis.`);

  console.log(`[workflow] Baixando PDF da entidade ${entidadeId}...`);
  const pdf = await ExecutarTJSP(sessao, entidadeId);
  console.log(`[workflow] PDF baixado: ${pdf.buffer.byteLength} bytes → ${pdf.path}`);

  console.log(`[workflow] Extraindo texto do PDF...`);
  const texto = await extrairConteudoPdf(pdf.path);

  console.log(`[workflow] Extraindo precatórios do texto...`);
  const precatorios = extrairDadosPrecatorioDoTextoPDF(texto);
  console.log(`[workflow] ${precatorios.length} precatório(s) encontrado(s).`);

  const resultado: PrecatorioConsolidado[] = [];
  const dadosEsaj: { processo: string; dados: Awaited<ReturnType<typeof extrairDadosDoESAJ>> | null }[] = [];
  const dadosDatajud: { processo: string; dados: Awaited<ReturnType<typeof extrairDadosDataJud>>[number] | null }[] = [];

  for (let i = 0; i < precatorios.length; i++) {
    const precatorio = precatorios[i];
    console.log(`[workflow] [${i + 1}/${precatorios.length}] Processando ${precatorio.processoOriginal}...`);

    let esaj: Awaited<ReturnType<typeof extrairDadosDoESAJ>> | null = null;
    try {
      console.log(`[workflow] [${i + 1}/${precatorios.length}] Buscando ESAJ...`);
      esaj = await extrairDadosDoESAJ(precatorio.processoOriginal);
      console.log(`[workflow] [${i + 1}/${precatorios.length}] ESAJ ok.`);
    } catch (error) {
      console.error(`[workflow] [${i + 1}/${precatorios.length}] ESAJ: erro ao buscar processo ${precatorio.processoOriginal}:`, error);
    }
    dadosEsaj.push({ processo: precatorio.processoOriginal, dados: esaj });

    let datajud: Awaited<ReturnType<typeof extrairDadosDataJud>>[number] | null = null;
    try {
      console.log(`[workflow] [${i + 1}/${precatorios.length}] Buscando DataJud...`);
      const datajuds = await extrairDadosDataJud(precatorio.processoOriginal);
      const processoOriginalSoDigitos = precatorio.processoOriginal.replace(/[^\d]/g, '');
      datajud = datajuds.find(d => d.numeroProcesso === processoOriginalSoDigitos) ?? null;
      if (datajud) {
        console.log(`[workflow] [${i + 1}/${precatorios.length}] DataJud ok.`);
      } else {
        console.warn(`[workflow] [${i + 1}/${precatorios.length}] DataJud: nenhum resultado para o processo ${precatorio.processoOriginal}`);
      }
    } catch (error) {
      console.error(`[workflow] [${i + 1}/${precatorios.length}] DataJud: erro ao buscar processo ${precatorio.processoOriginal}:`, error);
    }
    dadosDatajud.push({ processo: precatorio.processoOriginal, dados: datajud });

    const consolidado = consolidarDadosExtraidosTjsp({ precatorio, esaj, datajud });
    resultado.push(consolidado);
    console.log(`[workflow] [${i + 1}/${precatorios.length}] Consolidado. esaj=${consolidado.encontrado_esaj} datajud=${consolidado.encontrado_datajud}`);

    if (i < precatorios.length - 1) {
      await sleep(2000);
    }
  }

  const resultadosDir = join(process.cwd(), 'tmp', 'resultados');
  await mkdir(resultadosDir, { recursive: true });

  const outputPath = join(resultadosDir, `${entidadeId}.json`);
  await writeFile(outputPath, JSON.stringify(resultado, null, 2), 'utf-8');
  console.log(`[workflow] Resultado salvo em ${outputPath} (${resultado.length} precatório(s)).`);

  const esajPath = join(resultadosDir, `${entidadeId}-esaj.json`);
  await writeFile(esajPath, JSON.stringify(dadosEsaj, null, 2), 'utf-8');
  console.log(`[workflow] ESAJ salvo em ${esajPath} (${dadosEsaj.length} processo(s)).`);

  const datajudPath = join(resultadosDir, `${entidadeId}-datajud.json`);
  await writeFile(datajudPath, JSON.stringify(dadosDatajud, null, 2), 'utf-8');
  console.log(`[workflow] DataJud salvo em ${datajudPath} (${dadosDatajud.length} processo(s)).`);

  return resultado;
}
