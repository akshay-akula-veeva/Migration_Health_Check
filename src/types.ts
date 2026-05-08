export interface AuditConfig {
  criticalFields: string[];
  uniqueFields: string[];
  distinctValueFields: string[];
  emailFields: string[];
  dateFields: { column: string; format: string }[];
  regexFields: { column: string; pattern: string; description: string }[];
  maxLengths: Record<string, number>;
  expectedDelimiter: string;
}

export interface StructuralIssue {
  row: number;
  found_cols: number;
  expected: number;
}

export interface HiddenCharDetail {
  row: number;
  column: string;
  ghost_character_codes: string[];
}

export interface LengthViolation {
  violation_count: number;
  max_found_length: number;
  allowed_length: number;
}

export interface ValidationViolation {
  row: number;
  column: string;
  value: string;
  reason: string;
}

export interface AuditReport {
  file_health: {
    total_rows_scanned: number;
    has_bom: boolean;
    column_count: number;
    file_size?: number;
    file_name: string;
    headers: string[];
  };
  structural_issues: {
    delimiter_mismatches: StructuralIssue[];
  };
  hidden_characters: {
    total_cells_flagged: number;
    summary_all_unique_ghost_codes: string[];
    summary_unique_ghost_codes_per_column: Record<string, string[]>;
    details: HiddenCharDetail[];
  };
  data_profiling: {
    missing_critical_columns: string[];
    missing_length_check_columns: string[];
    missing_unique_check_columns: string[];
    missing_distinct_check_columns: string[];
    missing_email_columns: string[];
    null_violations: Record<string, number>;
    uniqueness_violations: Record<string, number>;
    email_violations: Record<string, number>;
    date_violations: Record<string, number>;
    regex_violations: Record<string, number>;
    length_violations: {
      total_violations: number;
      global_max_length_found: number;
      column_details: Record<string, LengthViolation>;
    };
    distinct_value_profiles: Record<string, Record<string, number>>;
    whitespace_issues: Record<string, number>;
    excel_mutations: Record<string, number>;
    violation_details: ValidationViolation[]; // For first N violations of complex rules
  };
}

export const GHOST_CHAR_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\u200b\u200e\u200f\u00a0]/g;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
