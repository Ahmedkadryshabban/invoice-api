import { extname } from 'node:path';
import { parse, type Info } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';
import { IMPORT_COLUMNS } from './invoices.dto.ts';
import { InvalidImportFileException } from './invoices.exceptions.ts';

export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;

const KNOWN_COLUMNS = new Set<string>(IMPORT_COLUMNS);
const REQUIRED_COLUMNS = IMPORT_COLUMNS.filter((column) => column !== 'paidAt');

export type ImportFile = { originalname: string; buffer: Buffer };
export type ImportRow = { row: number; values: Record<string, string> };

type SheetRow = { row: number; cells: string[] };
type CsvRecord = { record: string[]; info: Info };

export async function parseImportFile(file: ImportFile): Promise<ImportRow[]> {
  const extension = extname(file.originalname).toLowerCase();
  if (extension === '.csv') {
    return toRows(readCsv(file.buffer));
  }
  if (extension === '.xlsx') {
    return toRows(await readExcel(file.buffer));
  }
  throw new InvalidImportFileException(
    'Only .csv and .xlsx files are supported',
  );
}

function readCsv(buffer: Buffer): SheetRow[] {
  try {
    const records = parse(buffer, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      info: true,
    }) as unknown as CsvRecord[];
    return records.map(({ record, info }) => ({
      row: info.records + info.empty_lines,
      cells: record,
    }));
  } catch (error) {
    throw new InvalidImportFileException(
      error instanceof Error ? error.message : 'Could not read the CSV file',
    );
  }
}

async function readExcel(buffer: Buffer): Promise<SheetRow[]> {
  try {
    const rows = await readSheet(buffer);
    return rows
      .map((cells, index) => ({
        row: index + 1,
        cells: cells.map(cellToString),
      }))
      .filter(({ cells }) => cells.some((cell) => cell !== ''));
  } catch {
    throw new InvalidImportFileException('Could not read the Excel file');
  }
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell === 'string') return cell.trim();
  if (typeof cell === 'number' || typeof cell === 'boolean') {
    return String(cell);
  }
  return '';
}

function toRows(table: SheetRow[]): ImportRow[] {
  const [first, ...records] = table;
  if (!first) throw new InvalidImportFileException('The file is empty');
  const header = first.cells;

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

  return records.map(({ row, cells }) => ({
    row,
    values: Object.fromEntries(
      header.map((column, position) => [column, cells[position] ?? '']),
    ),
  }));
}
