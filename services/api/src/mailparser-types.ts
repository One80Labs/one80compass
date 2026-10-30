/** Ambient types for mailparser. A .d.ts file is gitignored in this repo. */
declare module "mailparser" {
  export function simpleParser(source: Buffer): Promise<{
    from?: { text?: string };
    to?: { text?: string } | Array<{ text?: string }>;
    subject?: string;
    text?: string;
    html?: string | false;
  }>;
}
