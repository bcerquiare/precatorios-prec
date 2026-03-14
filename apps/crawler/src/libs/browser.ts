import got, { type Got, type OptionsInit, type Response } from 'got';
import { CookieJar } from 'tough-cookie';
import { load, type CheerioAPI } from 'cheerio';
import type { IncomingHttpHeaders } from 'node:http';

export interface BrowserConfig {
  baseUrl?: string;
  userAgent?: string;
  timeout?: number;
  headers?: Record<string, string>;
  followRedirect?: boolean;
}

export interface BrowserResponse {
  html: string;
  $: CheerioAPI;
  status: number;
  headers: IncomingHttpHeaders;
  url: string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
}

export interface PostOptions extends RequestOptions {
  json?: Record<string, unknown>;
  form?: Record<string, string | number | boolean>;
  body?: string;
}

export class Browser {
  private readonly cookieJar: CookieJar;
  private readonly client: Got;

  constructor(config: BrowserConfig = {}) {
    this.cookieJar = new CookieJar();

    const options: OptionsInit = {
      cookieJar: this.cookieJar,
      followRedirect: config.followRedirect ?? true,
      headers: {
        'user-agent':
          config.userAgent ?? 'Mozilla/5.0 (compatible; PrecatoriosBot/1.0)',
        ...config.headers,
      },
    };

    if (config.baseUrl !== undefined) {
      options.prefixUrl = config.baseUrl;
    }

    if (config.timeout !== undefined) {
      options.timeout = { request: config.timeout };
    }

    this.client = got.extend(options);
  }

  async get(url: string, options: RequestOptions = {}): Promise<BrowserResponse> {
    const response = await this.client.get(url, {
      headers: options.headers,
    });
    return this._parse(response);
  }

  async post(url: string, body: PostOptions = {}): Promise<BrowserResponse> {
    const { json, form, headers } = body;
    const reqOptions: OptionsInit = { headers };

    if (json !== undefined) {
      reqOptions.json = json;
    } else if (form !== undefined) {
      reqOptions.form = form;
    }

    const response = (await this.client.post(url, reqOptions)) as Response;
    return this._parse(response);
  }

  async postBuffer(
    url: string,
    options: { body: string; headers?: Record<string, string> },
  ): Promise<{ buffer: Buffer; status: number; contentType: string }> {
    const response = await this.client.post(url, {
      body: options.body,
      headers: options.headers,
      responseType: 'buffer',
    });
    return {
      buffer: response.body as Buffer,
      status: response.statusCode,
      contentType: (response.headers['content-type'] ?? '').toString(),
    };
  }

  async getBuffer(url: string, options: { headers?: Record<string, string> } = {}): Promise<Buffer> {
    const response = await this.client.get(url, {
      headers: options.headers,
      responseType: 'buffer',
    });
    return response.body as Buffer;
  }

  dispose(): void {
    this.cookieJar.removeAllCookiesSync();
  }

  private _parse(response: Response): BrowserResponse {
    const html = response.body as string;
    return {
      html,
      $: load(html),
      status: response.statusCode,
      headers: response.headers,
      url: response.url,
    };
  }
}
