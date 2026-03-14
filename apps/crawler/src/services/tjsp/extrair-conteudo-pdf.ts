import { readFile } from 'fs/promises';
import { PDFParse } from 'pdf-parse';
import { text } from 'stream/consumers';

export async function extrairConteudoPdf(path: string): Promise<string> {

    const buffer = await readFile(path);
    
    const parser = new PDFParse({ data: buffer });
    const resultado = await parser.getText()
    return resultado.text;

}
