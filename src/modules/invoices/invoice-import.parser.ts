import { extname } from 'node:path';
import { parse } from 'csv-parse/sync';
import { IMPORT_COLUMNS } from './invoices.dto.ts';
import { InvalidImportFileException } from './invoices.exceptions.ts';

export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;

const KNOWN_COLUMNS = new Set<string>(IMPORT_COLUMNS);
const REQUIRED_COLUMNS = IMPORT_COLUMNS.filter((column) => column !== 'paidAt');

export type ImportFile = { originalname: string; buffer: Buffer };
export type ImportRow = { row: number; values: Record<string, string> };

export function parseImportFile(file: ImportFile): ImportRow[] {
  const extension = extname(file.originalname).toLowerCase();
  if (extension !== '.csv') {
    throw new InvalidImportFileException('Only .csv files are supported');
  }
  return toRows(readCsv(file.buffer));
}

function readCsv(buffer: Buffer): string[][] {
  try {
    return parse(buffer, { bom: true, trim: true, skip_empty_lines: true });
  } catch (error) {
    throw new InvalidImportFileException(
      error instanceof Error ? error.message : 'Could not read the CSV file',
    );
  }
}

function toRows(table: string[][]): ImportRow[] {
  const [header, ...records] = table;
  if (!header) throw new InvalidImportFileException('The file is empty');

  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new InvalidImportFileException(
      `Missing columns: ${missing.join(', ')}`,
    );
  }
  const unknown = header.filter((column) => !KNOWN_COLUMNS.has(column));
  if (unknown.length > 0) {
    throw new InvalidImportFileException(
      `Unknown columns: ${unknown.join(', ')}`,
    );
  }
  if (new Set(header).size !== header.length) {
    throw new InvalidImportFileException('Each column must appear once');
  }
  if (records.length === 0) {
    throw new InvalidImportFileException('The file has no invoice rows');
  }
  if (records.length > MAX_IMPORT_ROWS) {
    throw new InvalidImportFileException(
      `The file has ${records.length} rows, the limit is ${MAX_IMPORT_ROWS}`,
    );
  }

  return records.map((record, index) => ({
    row: index + 2,
    values: Object.fromEntries(
      header.map((column, position) => [column, record[position] ?? '']),
    ),
  }));
}
