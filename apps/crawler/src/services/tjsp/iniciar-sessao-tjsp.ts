import puppeteer, { type Page } from 'puppeteer';

const TJSP_URL = 'https://www.tjsp.jus.br/cac/scp/webRelPublicLstPagPrecatPendentes.aspx#';

export interface Entidade {
  id: string;
  name: string;
}

export interface SessaoTJSP {
  urlPostValida: string;
  headers: Record<string, string>;
  bodyStr: string;
  entidades: Entidade[];
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

async function configurarIntercepcao(page: Page, sessao: SessaoTJSP): Promise<void> {
  await page.setRequestInterception(true);

  page.on('request', (req) => {
    const ehPostAlvo =
      req.method() === 'POST' && req.url().includes('webRelPublicLstPagPrecatPendentes.aspx?');

    if (ehPostAlvo) {
      sessao.urlPostValida = req.url();
      sessao.headers = req.headers();
      sessao.bodyStr = req.postData() ?? '';
      req.abort();
    } else {
      req.continue();
    }
  });
}

async function extrairEntidades(page: Page): Promise<Entidade[]> {
  const gxStateRaw = await page
    .$eval('input[name="GXState"]', (el) => (el as any).value as string)
    .catch(() => '');

  if (!gxStateRaw) {
    throw new Error('Input GXState não encontrado na página');
  }

  const gxJson = JSON.parse(gxStateRaw) as Record<string, string>;
  return (JSON.parse(gxJson['vENT_ID_Values'])['v'] as Array<[string, string]>).map(([id, name]) => ({ id, name }));
}

async function dispararPrimeiroPost(page: Page, primeiraEntidade: Entidade): Promise<void> {
  await page.select('#vENT_ID', primeiraEntidade.id);
  await page.click('input[name="BUTTON3"]');
  await new Promise<void>((r) => setTimeout(r, 2000));
}

// ---------------------------------------------------------------------------
// Ponto de entrada
// ---------------------------------------------------------------------------

export async function IniciarSessaoNoTJSP(): Promise<SessaoTJSP> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const sessao: SessaoTJSP = {
    urlPostValida: '',
    headers: {},
    bodyStr: '',
    entidades: [],
  };

  await configurarIntercepcao(page, sessao);

  console.log('Abrindo TJSP com Puppeteer para capturar tokens de sessão...');
  await page.goto(TJSP_URL, { waitUntil: 'networkidle2' });

  sessao.entidades = await extrairEntidades(page);
  console.log(`${sessao.entidades.length} entidades encontradas.`);

  await dispararPrimeiroPost(page, sessao.entidades[0]);

  await browser.close();

  if (!sessao.urlPostValida) {
    throw new Error('Não foi possível capturar a sessão do TJSP — POST não interceptado');
  }

  return sessao;
}

