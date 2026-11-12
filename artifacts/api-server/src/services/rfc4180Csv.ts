/**
 * Strict RFC-4180 CSV parser and formula-injection-safe CSV serializer.
 */

export interface CsvParseOptions {
  maxBytes?: number;
  maxRows?: number;
}

export interface CsvParseDiagnostic {
  rowNumber: number;
  code: string;
  message: string;
}

export interface ParsedCsvDocument {
  headers: string[];
  rows: Array<{
    rowNumber: number;
    values: string[];
    record: Record<string, string>;
  }>;
  diagnostics: CsvParseDiagnostic[];
  fatalError?: string;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_ROWS = 2000;

export function parseRfc4180Csv(
  rawInput: string,
  options: CsvParseOptions = {},
): ParsedCsvDocument {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;

  if (typeof rawInput !== "string") {
    return {
      headers: [],
      rows: [],
      diagnostics: [],
      fatalError: "CSV payload must be text.",
    };
  }

  const byteLen = Buffer.byteLength(rawInput, "utf8");
  if (byteLen > maxBytes) {
    return {
      headers: [],
      rows: [],
      diagnostics: [],
      fatalError: `CSV file size (${byteLen} bytes) exceeds maximum limit of ${maxBytes} bytes.`,
    };
  }

  // Strip UTF-8 BOM if present
  const input = rawInput.charCodeAt(0) === 0xfeff ? rawInput.slice(1) : rawInput;
  if (!input.trim()) {
    return {
      headers: [],
      rows: [],
      diagnostics: [],
      fatalError: "CSV input is empty.",
    };
  }

  const rawRows: Array<{ rowNumber: number; fields: string[] }> = [];
  let currentFields: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let fieldStarted = false;
  let rowStartLine = 1;
  let currentLine = 1;
  let justClosedQuote = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    const next = i + 1 < input.length ? input[i + 1] : undefined;

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        if (ch === "\n") {
          currentLine += 1;
        }
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (fieldStarted) {
        return {
          headers: [],
          rows: [],
          diagnostics: [
            {
              rowNumber: rowStartLine,
              code: "UNEXPECTED_QUOTE",
              message: `Unexpected quotation mark inside unquoted field at line ${currentLine}.`,
            },
          ],
          fatalError: `Malformed CSV: unexpected quote inside unquoted field at line ${currentLine}.`,
        };
      }
      inQuotes = true;
      fieldStarted = true;
      continue;
    }

    if (justClosedQuote && ch !== "," && ch !== "\r" && ch !== "\n") {
      return {
        headers: [],
        rows: [],
        diagnostics: [
          {
            rowNumber: rowStartLine,
            code: "TRAILING_CHARS_AFTER_QUOTE",
            message: `Unexpected character '${ch}' after closing quote at line ${currentLine}.`,
          },
        ],
        fatalError: `Malformed CSV: unexpected character after closing quote at line ${currentLine}.`,
      };
    }

    if (ch === ",") {
      currentFields.push(currentField);
      currentField = "";
      fieldStarted = false;
      justClosedQuote = false;
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && next === "\n") {
        i += 1;
      }
      currentFields.push(currentField);
      const isBlankRow =
        currentFields.length === 1 && currentFields[0]!.trim() === "";
      if (!isBlankRow) {
        rawRows.push({ rowNumber: rowStartLine, fields: currentFields });
      }
      currentFields = [];
      currentField = "";
      fieldStarted = false;
      justClosedQuote = false;
      currentLine += 1;
      rowStartLine = currentLine;
      continue;
    }

    fieldStarted = true;
    currentField += ch;
  }

  if (inQuotes) {
    return {
      headers: [],
      rows: [],
      diagnostics: [
        {
          rowNumber: rowStartLine,
          code: "UNCLOSED_QUOTE",
          message: `Unclosed quoted field starting at line ${rowStartLine}.`,
        },
      ],
      fatalError: `Malformed CSV: unclosed quoted field starting at line ${rowStartLine}.`,
    };
  }

  if (fieldStarted || currentFields.length > 0) {
    currentFields.push(currentField);
    const isBlankRow =
      currentFields.length === 1 && currentFields[0]!.trim() === "";
    if (!isBlankRow) {
      rawRows.push({ rowNumber: rowStartLine, fields: currentFields });
    }
  }

  if (rawRows.length === 0) {
    return {
      headers: [],
      rows: [],
      diagnostics: [],
      fatalError: "CSV contains no rows.",
    };
  }

  const headers = rawRows[0]!.fields.map((h) => h.trim());
  if (headers.some((h) => h.length === 0)) {
    return {
      headers,
      rows: [],
      diagnostics: [
        {
          rowNumber: rawRows[0]!.rowNumber,
          code: "EMPTY_HEADER",
          message: "CSV header row contains an empty column name.",
        },
      ],
      fatalError: "CSV header row contains an empty column name.",
    };
  }

  const seenHeaders = new Set<string>();
  for (const h of headers) {
    const key = h.toLowerCase();
    if (seenHeaders.has(key)) {
      return {
        headers,
        rows: [],
        diagnostics: [
          {
            rowNumber: rawRows[0]!.rowNumber,
            code: "DUPLICATE_HEADER",
            message: `Duplicate CSV column header '${h}' detected.`,
          },
        ],
        fatalError: `Duplicate CSV column header '${h}' detected.`,
      };
    }
    seenHeaders.add(key);
  }

  const dataRows = rawRows.slice(1);
  if (dataRows.length === 0) {
    return {
      headers,
      rows: [],
      diagnostics: [],
      fatalError: "CSV must contain a header row and at least one data row.",
    };
  }

  if (dataRows.length > maxRows) {
    return {
      headers,
      rows: [],
      diagnostics: [],
      fatalError: `CSV row count (${dataRows.length}) exceeds maximum batch limit of ${maxRows} rows.`,
    };
  }

  const diagnostics: CsvParseDiagnostic[] = [];
  const rows: ParsedCsvDocument["rows"] = [];

  for (const rawRow of dataRows) {
    const record: Record<string, string> = {};
    if (rawRow.fields.length !== headers.length) {
      diagnostics.push({
        rowNumber: rawRow.rowNumber,
        code: "INCONSISTENT_COLUMN_COUNT",
        message: `Row ${rawRow.rowNumber} has ${rawRow.fields.length} columns; expected ${headers.length}.`,
      });
    }
    for (let c = 0; c < headers.length; c += 1) {
      record[headers[c]!] = (rawRow.fields[c] ?? "").trim();
    }
    rows.push({
      rowNumber: rawRow.rowNumber,
      values: rawRow.fields,
      record,
    });
  }

  return {
    headers,
    rows,
    diagnostics,
  };
}

const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

export function escapeCsvFormulaCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  const safe = FORMULA_TRIGGER_RE.test(str) ? `'${str}` : str;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function serializeSafeCsv(
  headers: string[],
  rows: Array<Record<string, unknown>>,
): string {
  const headerLine = headers.map((h) => escapeCsvFormulaCell(h)).join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvFormulaCell(row[h])).join(","),
  );
  return [headerLine, ...dataLines].join("\r\n");
}

