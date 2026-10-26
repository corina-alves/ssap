import { Montserrat } from 'next/font/google';

/**
 * Montserrat, a tipografia do kit da marca SP-Águas. A classe `montserrat.variable`
 * publica a variável --font-montserrat, que o --fonte de globals.css usa.
 */
export const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-montserrat' });
