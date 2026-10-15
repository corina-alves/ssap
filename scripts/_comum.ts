import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

/** Lê .env.local/.env (como o Next faz), sem sobrescrever o que já está no ambiente. */
export function carregarEnv(): void {
  for (const arquivo of ['.env.local', '.env']) {
    if (existsSync(arquivo)) process.loadEnvFile(arquivo);
  }
}

// Sem terminal (pipe, CI): as respostas vêm uma por linha da entrada padrão.
let linhas: string[] | null = null;
async function proximaLinha(): Promise<string> {
  if (!linhas) {
    linhas = [];
    for await (const l of createInterface({ input: process.stdin })) linhas.push(l);
  }
  return linhas.shift() ?? '';
}

/** Pergunta no terminal. Com `oculto`, o que é digitado não aparece na tela. */
export async function perguntar(texto: string, oculto = false): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdout.write(`${texto}\n`);
    return (await proximaLinha()).trim();
  }
  if (!oculto) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((ok) => rl.question(texto, (r) => (rl.close(), ok(r.trim()))));
  }
  return new Promise((ok, falha) => {
    const { stdin, stdout } = process;
    let valor = '';
    stdout.write(texto);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const fim = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', tecla);
      stdout.write('\n');
    };
    const tecla = (dado: string) => {
      for (const ch of dado) {
        if (ch === '\r' || ch === '\n') return fim(), ok(valor);
        if (ch === '\u0003') return fim(), falha(new Error('Cancelado.'));
        if (ch === '\u007f' || ch === '\b') valor = valor.slice(0, -1);
        else if (ch >= ' ') valor += ch;
      }
    };
    stdin.on('data', tecla);
  });
}
