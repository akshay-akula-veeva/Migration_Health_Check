import Papa from 'papaparse';
import { AuditConfig, AuditReport, GHOST_CHAR_PATTERN, StructuralIssue, HiddenCharDetail, ValidationViolation, EMAIL_REGEX } from '../types';

export async function auditFile(
  file: File,
  config: AuditConfig,
  onProgress: (progress: number) => void
): Promise<{ report: AuditReport; badRows: any[][] }> {
  const report: AuditReport = {
    file_health: {
      total_rows_scanned: 0,
      has_bom: false,
      column_count: 0,
      file_size: file.size,
      file_name: file.name,
      headers: [],
    },
    structural_issues: {
      delimiter_mismatches: [],
      empty_headers: [],
      unnamed_column_data: [],
    },
    hidden_characters: {
      total_cells_flagged: 0,
      summary_all_unique_ghost_codes: [],
      summary_unique_ghost_codes_per_column: {},
      details: [],
    },
    data_profiling: {
      missing_critical_columns: [],
      missing_length_check_columns: [],
      missing_unique_check_columns: [],
      missing_distinct_check_columns: [],
      missing_email_columns: [],
      null_violations: {},
      uniqueness_violations: {},
      email_violations: {},
      date_violations: {},
      regex_violations: {},
      length_violations: {
        total_violations: 0,
        global_max_length_found: 0,
        column_details: {},
      },
      distinct_value_profiles: {},
      whitespace_issues: {},
      excel_mutations: {},
      violation_details: [],
      flagged_rows: [],
    },
  };

  const globalUniqueGhosts = new Set<string>();
  const columnUniqueGhosts: Record<string, Set<string>> = {};
  const uniquenessTrackers: Record<string, Set<string>> = {};
  
  // Trackers for pandas-like data profiling
  const headersSet = new Set<string>();
  let headersList: string[] = [];

  // Check for BOM (Byte Order Mark)
  const buffer = await file.slice(0, 3).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    report.file_health.has_bom = true;
  }

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      delimiter: config.expectedDelimiter || ",",
      skipEmptyLines: 'greedy',
      header: false,
      worker: false, // Disabled worker to ensure main-thread closure access for flagged_rows
      encoding: "UTF-8",
      step: (results) => {
        const row = results.data as string[];
        report.file_health.total_rows_scanned++;
        const currentLine = report.file_health.total_rows_scanned;

        if (currentLine === 1) {
          headersList = row;
          headersList.forEach((h, idx) => {
            if (h.trim() === "") {
              report.structural_issues.empty_headers.push(idx.toString());
            }
            headersSet.add(h);
          });
          report.file_health.column_count = headersList.length;
          report.file_health.headers = headersList;
          
          // Check for missing columns in config
          report.data_profiling.missing_critical_columns = config.criticalFields.filter(f => !headersSet.has(f));
          report.data_profiling.missing_length_check_columns = Object.keys(config.maxLengths).filter(f => !headersSet.has(f));
          report.data_profiling.missing_unique_check_columns = config.uniqueFields.filter(f => !headersSet.has(f));
          report.data_profiling.missing_distinct_check_columns = config.distinctValueFields.filter(f => !headersSet.has(f));
          report.data_profiling.missing_email_columns = config.emailFields.filter(f => !headersSet.has(f));
          return;
        }

        const expectedCount = report.file_health.column_count;
        let rowIsFlagged = false;

        if (row.length !== expectedCount) {
          report.structural_issues.delimiter_mismatches.push({
            row: currentLine,
            found_cols: row.length,
            expected: expectedCount,
          });
          rowIsFlagged = true;
        }

        // Cell-by-cell scan
        row.forEach((cellValue, colIndex) => {
          const isUnnamed = headersList[colIndex] === undefined || headersList[colIndex].trim() === "";
          const colName = isUnnamed ? `Col_${colIndex + 1}_(Unnamed)` : headersList[colIndex];
          const stripped = cellValue.trim();

          if (isUnnamed && stripped !== "") {
            report.structural_issues.unnamed_column_data.push({ row: currentLine, col: colIndex });
            rowIsFlagged = true;
          }
          
          // Hidden Character Check
          const ghostMatches = cellValue.match(GHOST_CHAR_PATTERN);
          if (ghostMatches) {
            rowIsFlagged = true;
            const ghostCodes = ghostMatches.map(char => `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
            ghostCodes.forEach(code => globalUniqueGhosts.add(code));
            
            if (!columnUniqueGhosts[colName]) columnUniqueGhosts[colName] = new Set();
            ghostCodes.forEach(code => columnUniqueGhosts[colName].add(code));

            report.hidden_characters.details.push({
              row: currentLine,
              column: colName,
              ghost_character_codes: Array.from(new Set(ghostCodes)),
            });
            report.hidden_characters.total_cells_flagged++;
          }

          // 1. Null Violations
          if (config.criticalFields.includes(colName) && stripped === "") {
            rowIsFlagged = true;
            report.data_profiling.null_violations[colName] = (report.data_profiling.null_violations[colName] || 0) + 1;
            addViolation(report, currentLine, colName, cellValue, "Critical field is empty");
          }

          // 2. Uniqueness
          if (config.uniqueFields.includes(colName) && stripped !== "") {
            if (!uniquenessTrackers[colName]) uniquenessTrackers[colName] = new Set();
            if (uniquenessTrackers[colName].has(stripped)) {
              rowIsFlagged = true;
              report.data_profiling.uniqueness_violations[colName] = (report.data_profiling.uniqueness_violations[colName] || 0) + 1;
              addViolation(report, currentLine, colName, cellValue, "Value is not unique");
            } else {
              uniquenessTrackers[colName].add(stripped);
            }
          }

          // 3. Email Validation
          if (config.emailFields.includes(colName) && stripped !== "") {
            if (!EMAIL_REGEX.test(stripped)) {
              rowIsFlagged = true;
              report.data_profiling.email_violations[colName] = (report.data_profiling.email_violations[colName] || 0) + 1;
              addViolation(report, currentLine, colName, cellValue, "Invalid email format");
            }
          }

          // 4. Date Validation
          const dateConfig = config.dateFields.find(d => d.column === colName);
          if (dateConfig && stripped !== "") {
            let isValid = true;
            if (dateConfig.format === "YYYY-MM-DD") {
              // Strict check for YYYY-MM-DD
              isValid = /^\d{4}-\d{2}-\d{2}$/.test(stripped) && !isNaN(Date.parse(stripped));
            } else if (dateConfig.format === "YYYY-MM-DDTHH:mm:ssZ") {
              // Strict check for ISO 8601 DateTime
              isValid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(stripped) && !isNaN(Date.parse(stripped));
            } else {
              // Generic fallback
              isValid = !isNaN(Date.parse(stripped));
            }

            if (!isValid) {
              rowIsFlagged = true;
              report.data_profiling.date_violations[colName] = (report.data_profiling.date_violations[colName] || 0) + 1;
              addViolation(report, currentLine, colName, cellValue, `Invalid date format (Expected: ${dateConfig.format})`);
            }
          }

          // 5. Regex Validation
          const regexConfig = config.regexFields.find(r => r.column === colName);
          if (regexConfig && stripped !== "") {
            try {
              const re = new RegExp(regexConfig.pattern);
              if (!re.test(stripped)) {
                rowIsFlagged = true;
                report.data_profiling.regex_violations[colName] = (report.data_profiling.regex_violations[colName] || 0) + 1;
                addViolation(report, currentLine, colName, cellValue, regexConfig.description || `Failed pattern match: ${regexConfig.pattern}`);
              }
            } catch (e) {
              // Silently skip invalid regex in config for now
            }
          }

          // 6. Distinct Values
          if (config.distinctValueFields.includes(colName)) {
            if (!report.data_profiling.distinct_value_profiles[colName]) {
              report.data_profiling.distinct_value_profiles[colName] = {};
            }
            const key = stripped === "" ? "[EMPTY]" : stripped;
            report.data_profiling.distinct_value_profiles[colName][key] = (report.data_profiling.distinct_value_profiles[colName][key] || 0) + 1;
          }

          // 7. Max Lengths
          if (config.maxLengths[colName] !== undefined) {
            const maxAllowed = config.maxLengths[colName];
            if (cellValue.length > maxAllowed) {
              rowIsFlagged = true;
              report.data_profiling.length_violations.total_violations++;
              if (!report.data_profiling.length_violations.column_details[colName]) {
                report.data_profiling.length_violations.column_details[colName] = {
                  violation_count: 0,
                  max_found_length: 0,
                  allowed_length: maxAllowed
                };
              }
              const detail = report.data_profiling.length_violations.column_details[colName];
              detail.violation_count++;
              detail.max_found_length = Math.max(detail.max_found_length, cellValue.length);
              report.data_profiling.length_violations.global_max_length_found = Math.max(
                report.data_profiling.length_violations.global_max_length_found,
                cellValue.length
              );
              addViolation(report, currentLine, colName, cellValue, `Length ${cellValue.length} exceeds limit of ${maxAllowed}`);
            }
          }

          // Excel Mutations
          if (/^\d+\.\d+E\+\d+$/.test(cellValue)) {
            report.data_profiling.excel_mutations[colName] = (report.data_profiling.excel_mutations[colName] || 0) + 1;
          }

          // Whitespace issues
          if (/^\s+|\s+$/.test(cellValue)) {
            report.data_profiling.whitespace_issues[colName] = (report.data_profiling.whitespace_issues[colName] || 0) + 1;
          }
        });

        // Collect flagged rows for export
        if (rowIsFlagged) {
          // Add to flagged rows for CSV export (Limit to 5000 for memory)
          if (report.data_profiling.flagged_rows.length < 5000) {
            report.data_profiling.flagged_rows.push([currentLine, ...row]);
          }
        }

        if (currentLine % 1000 === 0) {
          onProgress(currentLine);
        }
      },
      complete: () => {
        report.hidden_characters.summary_all_unique_ghost_codes = Array.from(globalUniqueGhosts);
        Object.entries(columnUniqueGhosts).forEach(([col, ghosts]) => {
          report.hidden_characters.summary_unique_ghost_codes_per_column[col] = Array.from(ghosts);
        });
        resolve({ report, badRows: report.data_profiling.flagged_rows });
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

function addViolation(report: AuditReport, row: number, column: string, value: string, reason: string) {
  // Cap at 10,000 for memory safety
  if (report.data_profiling.violation_details.length < 10000) {
    report.data_profiling.violation_details.push({ row, column, value, reason });
  }
}
