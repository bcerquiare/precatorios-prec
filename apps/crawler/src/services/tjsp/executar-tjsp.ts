import AdmZip from 'adm-zip';
import { Browser } from '../../libs/browser.js';
import type { SessaoTJSP } from './iniciar-sessao-tjsp.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PDF_DIR = join(process.cwd(), 'tmp', 'pdfs');
const TJSP_BASE_URL = 'https://www.tjsp.jus.br/cac/scp/';

interface GxCommand {
  redirect?: { url: string };
}

interface GxResponse {
  gxCommands?: GxCommand[];
}

// ---------------------------------------------------------------------------
// Auxiliares puras
// ---------------------------------------------------------------------------

function prepararBody(sessao: SessaoTJSP, entidadeId: string): string {
  const params = new URLSearchParams(sessao.bodyStr);

  params.set('vENT_ID', entidadeId);

  const gxStateRaw = params.get('GXState');
  if (gxStateRaw) {
    const gxState = JSON.parse(gxStateRaw) as Record<string, unknown>;

    if (gxState['vENT_ID_Values']) {
      const entValues = JSON.parse(gxState['vENT_ID_Values'] as string) as Record<string, unknown>;
      entValues['s'] = entidadeId;
      gxState['vENT_ID_Values'] = JSON.stringify(entValues);
    }

    if (gxState['CAPTCHA1_Validationresult'] !== undefined) {
      gxState['CAPTCHA1_Validationresult'] = '1';
    }

    params.set('GXState', JSON.stringify(gxState));
  }

  return params.toString();
}

function limparHeaders(headers: Record<string, string>): Record<string, string> {
  const resultado = { ...headers };
  delete resultado['content-length'];
  delete resultado['Content-Length'];
  delete resultado['x-gx-ajax-request'];
  delete resultado['x-requested-with'];
  return resultado;
}

function extrairHeadersDeCookie(headers: Record<string, string>): Record<string, string> {
  const resultado: Record<string, string> = {};
  if (headers['cookie']) resultado['cookie'] = headers['cookie'];
  if (headers['Cookie']) resultado['Cookie'] = headers['Cookie'];
  return resultado;
}

function detectarTipoArquivo(buffer: Buffer): 'pdf' | 'zip' | 'desconhecido' {
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  if (isPdf) return 'pdf';

  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (isZip) return 'zip';

  return 'desconhecido';
}

function extrairPdfDoZip(zipBuffer: Buffer, entidadeId: string): Buffer {
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith('.pdf'));

  if (!entry) {
    throw new Error(`Entidade ${entidadeId}: ZIP não contém nenhum arquivo .pdf`);
  }

  const pdf = zip.readFile(entry);
  if (!pdf) {
    throw new Error(`Entidade ${entidadeId}: falha ao extrair PDF do ZIP`);
  }

  return pdf;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

async function salvarPdf(entidadeId: string, pdfBuffer: Buffer): Promise<string> {
  await mkdir(PDF_DIR, { recursive: true });
  const filePath = join(PDF_DIR, `entidade-${entidadeId}.pdf`);
  await writeFile(filePath, pdfBuffer);
  return filePath;
}

async function salvarDebug(entidadeId: string, buffer: Buffer): Promise<string> {
  await mkdir(PDF_DIR, { recursive: true });
  const filePath = join(PDF_DIR, `entidade-${entidadeId}-debug.html`);
  await writeFile(filePath, buffer);
  return filePath;
}

// ---------------------------------------------------------------------------
// Download via redirect
// ---------------------------------------------------------------------------

async function baixarPdfViaRedirect(
  browser: Browser,
  redirectUrl: string,
  cookieHeaders: Record<string, string>,
  entidadeId: string,
): Promise<{ buffer: Buffer; path: string }> {
  const urlCompleta = `${TJSP_BASE_URL}${redirectUrl}`;
  const buffer = await browser.getBuffer(urlCompleta, { headers: cookieHeaders });
  const tipo = detectarTipoArquivo(buffer);

  if (tipo === 'desconhecido') {
    const debugPath = await salvarDebug(entidadeId, buffer);
    console.error(`Download retornou conteúdo inválido. Salvo em: ${debugPath}`);
    console.error(`Início: ${buffer.toString('utf8', 0, 500)}`);
    throw new Error(`Entidade ${entidadeId}: download não retornou PDF válido`);
  }

  if (tipo === 'zip') {
    const pdfExtraido = extrairPdfDoZip(buffer, entidadeId);
    const filePath = await salvarPdf(entidadeId, pdfExtraido);
    console.log(`PDF extraído do ZIP e salvo em: ${filePath}`);
    return {
        buffer: pdfExtraido,
        path: filePath,
    };
  }

  // tipo === 'pdf'
  const filePath = await salvarPdf(entidadeId, buffer);
  console.log(`PDF salvo em: ${filePath}`);
  return {
      buffer,
      path: filePath,
  };
}

// ---------------------------------------------------------------------------
// Ponto de entrada
// ---------------------------------------------------------------------------

export async function ExecutarTJSP(sessao: SessaoTJSP, entidadeId: string): Promise<{buffer: Buffer; path: string}> {
  const browser = new Browser();

  try {
    const body = prepararBody(sessao, entidadeId);
    const headers = limparHeaders(sessao.headers);

    console.log(`Fazendo POST para entidade ${entidadeId}...`);

    const { buffer: respostaBuffer, status, contentType } = await browser.postBuffer(sessao.urlPostValida, {
      body,
      headers,
    });

    console.log(`POST: status=${status} content-type=${contentType} tamanho=${respostaBuffer.byteLength} bytes`);

    // GeneXus retorna JSON com redirect para a URL real do PDF
    if (contentType.includes('application/json')) {
      const json = JSON.parse(respostaBuffer.toString('utf8')) as GxResponse;
      const redirectUrl = json.gxCommands?.find((c) => c.redirect)?.redirect?.url;

      if (!redirectUrl) {
        const debugPath = await salvarDebug(entidadeId, respostaBuffer);
        throw new Error(`Entidade ${entidadeId}: JSON sem redirect. Salvo em ${debugPath}`);
      }

      console.log(`Redirect detectado, baixando PDF...`);
      const cookieHeaders = extrairHeadersDeCookie(sessao.headers);
      return await baixarPdfViaRedirect(browser, redirectUrl, cookieHeaders, entidadeId);
    }

    // Resposta já é o PDF direto
    if (detectarTipoArquivo(respostaBuffer) !== 'pdf') {
      const debugPath = await salvarDebug(entidadeId, respostaBuffer);
      console.error(`Resposta inválida. Salvo em: ${debugPath}`);
      console.error(`Início: ${respostaBuffer.toString('utf8', 0, 500)}`);
      throw new Error(`Entidade ${entidadeId}: resposta inválida (status=${status}, content-type=${contentType})`);
    }

    const filePath = await salvarPdf(entidadeId, respostaBuffer);
    console.log(`PDF salvo em: ${filePath}`);
    return {
        buffer: respostaBuffer,
        path: filePath,
    };
  } finally {
    browser.dispose();
  }
}
