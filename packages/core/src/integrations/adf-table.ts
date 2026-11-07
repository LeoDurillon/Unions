// An ADF table as a GitHub-flavored markdown table: the first row is the header, cells on one line.
import { type AdfContext, type AdfNode, type BlockRenderer, numberAttr } from './adf-node';

const NEWLINES = /\n+/gu;

/** A cell's blocks on one line: `|` escaped, line breaks as `<br>`. */
function cellText(cell: AdfNode, context: AdfContext, render: BlockRenderer): string {
  return render(cell.content, { ...context, inTable: true })
    .replaceAll('|', String.raw`\|`)
    .replaceAll(NEWLINES, '<br>')
    .trim();
}

/** A row's cells, a spanning cell followed by empty ones so columns stay aligned. */
function rowCells(row: AdfNode, context: AdfContext, render: BlockRenderer): string[] {
  return row.content.flatMap((cell) => {
    const span = Math.max(1, Math.trunc(numberAttr(cell.attrs, 'colspan') ?? 1));
    return [cellText(cell, context, render), ...Array.from({ length: span - 1 }, () => '')];
  });
}

function line(cells: string[], width: number): string {
  const padded = [...cells, ...Array.from({ length: width - cells.length }, () => '')];
  return `| ${padded.join(' | ')} |`;
}

export function tableMarkdown(node: AdfNode, context: AdfContext, render: BlockRenderer): string {
  const rows = node.content
    .filter((row) => row.type === 'tableRow')
    .map((row) => rowCells(row, context, render));
  const width = Math.max(1, ...rows.map((cells) => cells.length));
  const [header = [], ...body] = rows;
  return [
    line(header, width),
    line(
      Array.from({ length: width }, () => '---'),
      width,
    ),
    ...body.map((cells) => line(cells, width)),
  ].join('\n');
}
