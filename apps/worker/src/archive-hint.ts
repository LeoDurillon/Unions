// How to read attached Office files and zip archives with the unzip commands the step's tools allow.
import type { Attachment } from '@union/core';

/** Office Open XML and OpenDocument files are zip archives of XML parts. */
const ARCHIVE = /\.(?:zip|xlsx|xlsm|docx|pptx|odt|ods|odp)$/iu;
const RULE = /^Bash\((?<command>.*)\)$/u;

/** Whether `tools` lets the agent run `command` (bare `Bash`, or a rule it starts with). */
export function bashAllows(tools: readonly string[], command: string): boolean {
  return tools.some((tool) => {
    if (tool === 'Bash') {
      return true;
    }
    const rule = RULE.exec(tool)?.groups?.command;
    if (rule === undefined) {
      return false;
    }
    const prefix = rule.replace(/:?\*$/u, '');
    return prefix.endsWith(' ') ? command.startsWith(prefix) : command.startsWith(prefix.trimEnd());
  });
}

function usage(list: boolean, print: boolean): string {
  const steps = [
    list ? 'list its parts with `unzip -l <file>`' : '',
    print
      ? 'print a part with `unzip -p <file> <part>`: for a spreadsheet `xl/sharedStrings.xml` (the text), `xl/worksheets/sheet1.xml` (cells, merges and style ids; one file per sheet) and `xl/styles.xml`; for a document `word/document.xml`; for slides `ppt/slides/slide1.xml`'
      : '',
  ].filter((step) => step !== '');
  return steps.join(', then ');
}

/** The hint for the attached archives; empty when there is none, or no unzip command is allowed. */
export function archiveHint(
  attachments: readonly Pick<Attachment, 'name'>[],
  tools: readonly string[],
): string {
  const archives = attachments.filter((attachment) => ARCHIVE.test(attachment.name));
  const list = bashAllows(tools, 'unzip -l ');
  const print = bashAllows(tools, 'unzip -p ');
  if (archives.length === 0 || (!list && !print)) {
    return '';
  }
  const names = archives.map((archive) => `\`${archive.name}\``).join(', ');
  return `${names} ${archives.length === 1 ? 'is a zip archive' : 'are zip archives'} of XML files, which Read cannot open. To read one, ${usage(list, print)}. Run each as a command of its own, not chained with \`&&\`, \`;\` or \`|\`, and do not extract the archive.`;
}
