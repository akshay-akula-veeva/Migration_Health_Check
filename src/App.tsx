import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  FileText, 
  Settings, 
  ShieldAlert, 
  Fingerprint, 
  Database, 
  Download, 
  Trash2, 
  Search,
  LayoutGrid,
  FileWarning,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Plus,
  X,
  RefreshCw,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { cn, formatBytes } from './lib/utils';
import { AuditConfig, AuditReport } from './types';
import { auditFile } from './lib/auditEngine';

// --- Components ---

const StatusCard = ({ title, value, icon: Icon, color, description }: { 
  title: string; 
  value: string | number; 
  icon: any; 
  color: string;
  description?: string;
}) => (
  <div className="bg-white border border-[#141414] rounded-none p-4 flex flex-col gap-1 shadow-none transition-all">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">{title}</span>
      <Icon className="w-4 h-4 opacity-30" />
    </div>
    <div className="flex items-end justify-between">
      <span className="text-3xl font-mono leading-none">{value}</span>
      {description && <span className="text-[9px] uppercase font-bold text-slate-400">{description}</span>}
    </div>
  </div>
);

const SectionTitle = ({ children, icon: Icon }: { children: React.ReactNode; icon?: any }) => (
  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#141414] opacity-50 flex items-center gap-2 mb-4">
    {Icon && <Icon className="w-3 h-3" />}
    {children}
  </h3>
);

// --- Main App ---

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [badRows, setBadRows] = useState<any[][]>([]);
  const [progress, setProgress] = useState(0);

  // Configuration State
  const [config, setConfig] = useState<AuditConfig>({
    criticalFields: [],
    uniqueFields: [],
    distinctValueFields: [],
    emailFields: [],
    dateFields: [],
    regexFields: [],
    maxLengths: {},
    expectedDelimiter: ",",
  });

  const [headers, setHeaders] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'summary' | 'structural' | 'data' | 'hidden' | 'warnings'>('summary');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      setFile(f);
      setReport(null);
      setBadRows([]);
      setHeaders([]);
      
      // Quick pre-scan for headers
      Papa.parse(f, {
        preview: 1,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            setHeaders(results.data[0] as string[]);
          }
        }
      });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'text/csv': ['.csv'] },
    multiple: false 
  } as any);

  const runAudit = async () => {
    if (!file) return;
    setIsAuditing(true);
    setProgress(0);
    setReport(null);

    try {
      const result = await auditFile(file, config, (p) => setProgress(p));
      setReport(result.report);
      setBadRows(result.badRows);
    } catch (err) {
      console.error(err);
      alert("Error auditing file. Check console for details.");
    } finally {
      setIsAuditing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setReport(null);
    setBadRows([]);
  };

  const downloadJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `migration_audit_report_${new Date().getTime()}.json`;
    a.click();
  };

  const downloadBadRows = () => {
    if (badRows.length === 0) return;
    
    // Use headers from report if available, fallback to initial headers state
    const activeHeaders = report?.file_health.headers && report.file_health.headers.length > 0 
      ? report.file_health.headers 
      : headers;

    const exportHeaders = ["Row_ID", ...activeHeaders];
    const exportData = [exportHeaders, ...badRows];
    
    try {
      const csv = Papa.unparse(exportData);
      const fileName = `flagged_rows_${file?.name || 'audit'}_${new Date().getTime()}.csv`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export rows. This can happen with extremely large files or mismatched data.");
    }
  };

  const totalViolations = useMemo(() => {
    if (!report) return 0;
    const dp = report.data_profiling;
    const countSum = (obj: Record<string, number>) => (Object.values(obj) as number[]).reduce((a, b) => a + b, 0);
    
    return countSum(dp.null_violations) + 
           countSum(dp.uniqueness_violations) + 
           countSum(dp.email_violations) + 
           countSum(dp.date_violations) + 
           countSum(dp.regex_violations) + 
           dp.length_violations.total_violations;
  }, [report]);

  // Helper for adding/removing items from array config
  const toggleConfigItem = (field: keyof AuditConfig, value: string) => {
    setConfig(prev => {
      const current = prev[field] as string[];
      if (current.includes(value)) {
        return { ...prev, [field]: current.filter(i => i !== value) };
      }
      return { ...prev, [field]: [...current, value] };
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-[#F1F0ED] border-b border-[#141414] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-[#141414] text-white p-2 text-[10px] font-bold leading-none">MGR.01</div>
            <h1 className="text-lg font-bold tracking-tight text-[#141414] uppercase">Migration Audit Utility</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {report && (
              <div className="flex items-center gap-3">
                <button 
                  onClick={downloadJSON}
                  className="px-4 py-2 border border-[#141414] font-bold text-[10px] uppercase hover:bg-slate-100 transition-all"
                >
                  Export JSON
                </button>
                <button 
                  onClick={downloadBadRows}
                  disabled={badRows.length === 0}
                  className="px-4 py-2 bg-[#141414] text-white font-bold text-[10px] uppercase hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  Export Flagged
                </button>
              </div>
            )}
            {file && (
              <button 
                onClick={reset}
                className="text-slate-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {!file ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center min-h-[60vh]"
          >
            <div className="text-center mb-10 max-w-2xl">
              <h2 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">CSV Migration Health Check</h2>
              <p className="text-lg text-slate-500">
                Identify hidden characters, structural issues, and data profiling violations 
                before they break your migration. Process files locally with privacy.
              </p>
            </div>

            <div 
              {...getRootProps()} 
              className={cn(
                "w-full max-w-xl aspect-video border-2 border-[#141414] border-dashed rounded-none flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300",
                isDragActive ? "bg-[#DCDAD6] scale-102" : "bg-white hover:bg-slate-50"
              )}
            >
              <input {...getInputProps()} />
              <div className="bg-[#141414] text-white p-4">
                <Database className="w-8 h-8" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold uppercase tracking-widest text-slate-700">
                  {isDragActive ? "Incite drop sequence" : "Ready for input source"}
                </p>
                <p className="text-[10px] uppercase font-bold text-slate-400 mt-2">CSV / UTF-8 ENCODED</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar Config */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-[#DCDAD6] border border-[#141414] rounded-none p-6">
                <SectionTitle icon={Settings}>Configuration Profile</SectionTitle>
                
                  <div className="space-y-6">
                    {/* Critical Fields */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414] opacity-40 block mb-2">Critical Fields (Required)</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {config.criticalFields.map(field => (
                          <span key={field} className="flex items-center gap-1 px-2 py-1 bg-white text-[#141414] border border-[#141414] text-[10px] font-bold">
                            {field}
                            <button onClick={() => toggleConfigItem('criticalFields', field)}><X className="w-3 h-3 hover:text-red-500" /></button>
                          </span>
                        ))}
                      </div>
                      <select 
                        className="w-full bg-white border border-[#141414]/20 p-1 text-[10px] font-bold uppercase"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "__CUSTOM__") {
                            const custom = prompt("Enter Critical Field Name:");
                            if (custom) toggleConfigItem('criticalFields', custom);
                          } else if (val) {
                            toggleConfigItem('criticalFields', val);
                          }
                          e.target.value = "";
                        }}
                      >
                        <option value="">+ Add Column</option>
                        {(headers.length > 0 ? headers : config.criticalFields).map(h => (
                          <option key={h} value={h} disabled={config.criticalFields.includes(h)}>{h}</option>
                        ))}
                        <option value="__CUSTOM__">Manual Entry...</option>
                      </select>
                    </div>

                    {/* Unique Fields */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414] opacity-40 block mb-2">Unique Constraints</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {config.uniqueFields.map(field => (
                          <span key={field} className="flex items-center gap-1 px-2 py-1 bg-white text-[#141414] border border-[#141414] text-[10px] font-bold">
                            {field}
                            <button onClick={() => toggleConfigItem('uniqueFields', field)}><X className="w-3 h-3 hover:text-red-500" /></button>
                          </span>
                        ))}
                      </div>
                      <select 
                        className="w-full bg-white border border-[#141414]/20 p-1 text-[10px] font-bold uppercase"
                        onChange={(e) => {
                          if (e.target.value) {
                            toggleConfigItem('uniqueFields', e.target.value);
                            e.target.value = "";
                          }
                        }}
                      >
                        <option value="">+ Add Column</option>
                        {headers.map(h => (
                          <option key={h} value={h} disabled={config.uniqueFields.includes(h)}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Email Fields */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414] opacity-40 block mb-2">Email Validation</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {config.emailFields.map(field => (
                          <span key={field} className="flex items-center gap-1 px-2 py-1 bg-white text-[#141414] border border-[#141414] text-[10px] font-bold">
                            {field}
                            <button onClick={() => toggleConfigItem('emailFields', field)}><X className="w-3 h-3 hover:text-red-500" /></button>
                          </span>
                        ))}
                      </div>
                      <select 
                        className="w-full bg-white border border-[#141414]/20 p-1 text-[10px] font-bold uppercase"
                        onChange={(e) => {
                          if (e.target.value) {
                            toggleConfigItem('emailFields', e.target.value);
                            e.target.value = "";
                          }
                        }}
                      >
                        <option value="">+ Add Column</option>
                        {headers.map(h => (
                          <option key={h} value={h} disabled={config.emailFields.includes(h)}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Date Fields */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414] opacity-40 block mb-2">Date Validation</label>
                      <div className="space-y-3 mb-2">
                        {config.dateFields.map((df, idx) => (
                          <div key={df.column} className="p-2 bg-white border border-[#141414] space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black truncate">{df.column}</span>
                              <button onClick={() => setConfig({...config, dateFields: config.dateFields.filter(f => f.column !== df.column)})} className="text-red-500">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <select 
                              className="w-full bg-slate-50 border border-[#141414]/10 p-1 text-[9px] font-bold"
                              value={df.format}
                              onChange={(e) => {
                                const newFields = [...config.dateFields];
                                newFields[idx].format = e.target.value;
                                setConfig({...config, dateFields: newFields});
                              }}
                            >
                              <option value="YYYY-MM-DD">Veeva Date: YYYY-MM-DD</option>
                              <option value="YYYY-MM-DDTHH:mm:ssZ">Veeva DateTime: YYYY-MM-DDTHH:mm:ssZ</option>
                              <option value="MM/DD/YYYY">US: MM/DD/YYYY</option>
                              <option value="DD/MM/YYYY">UK: DD/MM/YYYY</option>
                            </select>
                          </div>
                        ))}
                      </div>
                      <select 
                        className="w-full bg-white border border-[#141414]/20 p-1 text-[10px] font-bold uppercase"
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !config.dateFields.some(f => f.column === val)) {
                            setConfig({...config, dateFields: [...config.dateFields, { column: val, format: "YYYY-MM-DD" }]});
                          }
                        }}
                      >
                        <option value="">+ Add Column</option>
                        {headers.map(h => (
                          <option key={h} value={h} disabled={config.dateFields.some(f => f.column === h)}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Regex Fields */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414] opacity-40 block mb-2">Regex Validation</label>
                      <div className="space-y-3 mb-2">
                        {config.regexFields.map((rf, idx) => (
                          <div key={rf.column} className="p-2 bg-white border border-[#141414] space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black truncate">{rf.column}</span>
                              <button onClick={() => setConfig({...config, regexFields: config.regexFields.filter(f => f.column !== rf.column)})} className="text-red-500">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <input 
                              type="text"
                              placeholder="Pattern (e.g. ^ID_\\d+$)"
                              className="w-full bg-slate-50 border border-[#141414]/10 p-1 text-[9px] font-mono"
                              value={rf.pattern}
                              onChange={(e) => {
                                const newFields = [...config.regexFields];
                                newFields[idx].pattern = e.target.value;
                                setConfig({...config, regexFields: newFields});
                              }}
                            />
                            <input 
                              type="text"
                              placeholder="Error Description"
                              className="w-full bg-slate-50 border border-[#141414]/10 p-1 text-[9px] font-bold"
                              value={rf.description}
                              onChange={(e) => {
                                const newFields = [...config.regexFields];
                                newFields[idx].description = e.target.value;
                                setConfig({...config, regexFields: newFields});
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <select 
                        className="w-full bg-white border border-[#141414]/20 p-1 text-[10px] font-bold uppercase"
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !config.regexFields.some(f => f.column === val)) {
                            setConfig({...config, regexFields: [...config.regexFields, { column: val, pattern: "", description: "Invalid pattern match" }]});
                          }
                        }}
                      >
                        <option value="">+ Add Column</option>
                        {headers.map(h => (
                          <option key={h} value={h} disabled={config.regexFields.some(f => f.column === h)}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Distinct Values */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414] opacity-40 block mb-2">Distinct Profiling</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {config.distinctValueFields.map(field => (
                          <span key={field} className="flex items-center gap-1 px-2 py-1 bg-white text-[#141414] border border-[#141414] text-[10px] font-bold">
                            {field}
                            <button onClick={() => toggleConfigItem('distinctValueFields', field)}><X className="w-3 h-3 hover:text-red-500" /></button>
                          </span>
                        ))}
                      </div>
                      <select 
                        className="w-full bg-white border border-[#141414]/20 p-1 text-[10px] font-bold uppercase"
                        onChange={(e) => {
                          if (e.target.value) {
                            toggleConfigItem('distinctValueFields', e.target.value);
                            e.target.value = "";
                          }
                        }}
                      >
                        <option value="">+ Add Column</option>
                        {headers.map(h => (
                          <option key={h} value={h} disabled={config.distinctValueFields.includes(h)}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Length Constraints */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414] opacity-40 block mb-2">Length Constraints</label>
                      <div className="space-y-3 mb-2">
                        {Object.entries(config.maxLengths).map(([field, len]) => (
                          <div key={field} className="p-2 bg-white border border-[#141414] space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black truncate">{field}</span>
                              <button onClick={() => {
                                const newConfig = { ...config.maxLengths };
                                delete newConfig[field];
                                setConfig({ ...config, maxLengths: newConfig });
                              }} className="text-red-500">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold uppercase opacity-40">MAX:</span>
                              <input 
                                type="number"
                                className="w-full bg-slate-50 border border-[#141414]/10 p-1 text-[9px] font-mono"
                                value={len}
                                onChange={(e) => {
                                  setConfig({
                                    ...config,
                                    maxLengths: { ...config.maxLengths, [field]: parseInt(e.target.value) || 0 }
                                  });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <select 
                        className="w-full bg-white border border-[#141414]/20 p-1 text-[10px] font-bold uppercase"
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && config.maxLengths[val] === undefined) {
                            setConfig({ ...config, maxLengths: { ...config.maxLengths, [val]: 255 } });
                          }
                        }}
                      >
                        <option value="">+ Add Column</option>
                        {headers.map(h => (
                          <option key={h} value={h} disabled={config.maxLengths[h] !== undefined}>{h}</option>
                        ))}
                      </select>
                    </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414] opacity-40 block mb-2">Delimiter</label>
                    <select 
                      value={config.expectedDelimiter}
                      onChange={(e) => setConfig({...config, expectedDelimiter: e.target.value})}
                      className="w-full bg-white border border-[#141414] px-3 py-2 text-[11px] font-mono outline-none"
                    >
                      <option value=",">Comma [,]</option>
                      <option value=";">Semicolon [;]</option>
                      <option value="	">Tab [\t]</option>
                      <option value="|">Pipe [|]</option>
                    </select>
                  </div>

                  <button 
                    onClick={runAudit}
                    disabled={isAuditing}
                    className="w-full bg-[#141414] text-white py-3 font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
                  >
                    {isAuditing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                    {isAuditing ? 'Executing...' : 'Run Audit'}
                  </button>
                </div>
              </div>

              {file && (
                <div className="bg-[#141414] text-white p-5 border border-[#141414]">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/10 p-2"><FileText className="w-4 h-4" /></div>
                    <div className="overflow-hidden">
                      <p className="text-[11px] font-mono truncate">{file.name}</p>
                      <p className="text-[9px] uppercase font-bold opacity-40">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* main content */}
            <div className="lg:col-span-3">
              {!report ? (
                 <div className="h-full flex flex-col items-center justify-center bg-white border border-[#141414] p-12 text-center">
                   {isAuditing ? (
                     <div className="space-y-6 w-full max-w-sm">
                        <div className="w-16 h-16 bg-[#141414] text-white flex items-center justify-center mx-auto">
                          <RefreshCw className="w-8 h-8 animate-spin" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-widest">Scanning Rows</h3>
                          <p className="text-[#141414] opacity-50 text-[10px] mt-2 font-bold uppercase">Source: {file.name}</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-mono opacity-50 uppercase font-bold">
                            <span>{progress.toLocaleString()} processed</span>
                            <span>Stream Active</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1">
                             <div className="bg-[#141414] h-full animate-[progress_10s_linear_infinite]" />
                          </div>
                        </div>
                     </div>
                   ) : (
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-6 rounded-none w-20 h-20 flex items-center justify-center mx-auto text-[#141414]">
                        <Search className="w-10 h-10 opacity-20" />
                      </div>
                      <h3 className="text-sm font-bold uppercase tracking-widest opacity-30">Analytical Environment Ready</h3>
                    </div>
                   )}
                 </div>
              ) : (
                <div className="space-y-8">
                  {/* Health Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <StatusCard 
                      title="File Rows" 
                      value={report.file_health.total_rows_scanned.toLocaleString()} 
                      icon={Database} 
                      color="bg-slate-100"
                    />
                    <StatusCard 
                      title="Dimension" 
                      value={`${report.file_health.column_count} Col`} 
                      icon={LayoutGrid} 
                      color="bg-slate-100"
                    />
                    <StatusCard 
                      title="BOM State" 
                      value={report.file_health.has_bom ? "SIG" : "NONE"} 
                      icon={Info} 
                      color="bg-slate-100"
                      description={report.file_health.has_bom ? "UTF-8-SIG DETECTED" : "STANDARD UTF-8"}
                    />
                    <StatusCard 
                      title="Violations" 
                      value={totalViolations} 
                      icon={ShieldAlert} 
                      color="bg-slate-100"
                    />
                  </div>

                  {/* Tabs */}
                  <div className="bg-white border border-[#141414] shadow-none flex flex-col min-h-[500px]">
                    <div className="flex border-b border-[#141414] bg-[#F1F0ED]">
                      {[
                        { id: 'summary', label: 'Profiling Summary', icon: LayoutGrid },
                        { id: 'structural', label: 'Structural', icon: FileWarning, count: report.structural_issues.delimiter_mismatches.length },
                        { id: 'hidden', label: 'Hidden Chars', icon: Fingerprint, count: report.hidden_characters.total_cells_flagged },
                        { id: 'data', label: 'Health Detail', icon: AlertCircle, count: totalViolations },
                        { id: 'warnings', label: 'Environment', icon: ShieldAlert, count: report.data_profiling.missing_critical_columns.length + Object.keys(report.data_profiling.excel_mutations).length }
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as any)}
                          className={cn(
                            "flex items-center gap-3 px-6 py-3 text-[10px] font-bold uppercase tracking-widest border-r border-[#141414] transition-all",
                            activeTab === tab.id 
                              ? "bg-white text-[#141414]" 
                              : "text-slate-400 hover:text-slate-900"
                          )}
                        >
                          {tab.label}
                          {(tab.count || 0) > 0 && (
                            <span className="bg-[#141414] text-white px-1.5 py-0.5 text-[8px]">{tab.count}</span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="p-6">
                       <AnimatePresence mode="wait">
                          {activeTab === 'summary' && (
                            <motion.div 
                              key="summary"
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              className="space-y-8"
                            >
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                  <div className="space-y-4">
                                     <SectionTitle icon={Fingerprint}>Ghost Characters</SectionTitle>
                                     <div className="bg-slate-50 p-4 border border-[#141414]">
                                        <p className="text-[10px] text-[#141414] mb-4 font-bold uppercase tracking-[0.2em] opacity-40">Unique Codes Found</p>
                                        <div className="flex flex-wrap gap-2">
                                           {report.hidden_characters.summary_all_unique_ghost_codes.length > 0 ? (
                                             report.hidden_characters.summary_all_unique_ghost_codes.map(code => (
                                               <code key={code} className="px-2 py-1 bg-white border border-[#141414] text-[#141414] text-[10px] font-bold">{code}</code>
                                             ))
                                           ) : (
                                             <div className="flex items-center gap-2 text-emerald-600">
                                               <CheckCircle2 className="w-4 h-4" />
                                               <span className="text-[10px] font-bold uppercase tracking-widest">None detected</span>
                                             </div>
                                           )}
                                        </div>
                                     </div>
                                  </div>

                                  <div className="space-y-4">
                                     <SectionTitle icon={Database}>Critical Field Health</SectionTitle>
                                     <div className="space-y-1">
                                        {Object.entries(report.data_profiling.null_violations).length > 0 ? (
                                          Object.entries(report.data_profiling.null_violations).map(([col, count]) => (
                                            <div key={col} className="flex items-center justify-between p-3 border-b border-[#141414]/10 text-[11px]">
                                               <span className="font-bold opacity-60 uppercase tracking-wider">{col}</span>
                                               <span className="text-red-600 font-mono font-bold">{count} NULLS</span>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="p-3 bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-700 text-[10px] font-bold uppercase tracking-widest">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Null Integrity Verified
                                          </div>
                                        )}
                                     </div>
                                  </div>
                               </div>

                               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-100">
                                   <div className="space-y-4">
                                      <SectionTitle icon={AlertCircle}>Uniqueness & Formats</SectionTitle>
                                      <div className="space-y-2">
                                        {/* Uniqueness */}
                                        {Object.entries(report.data_profiling.uniqueness_violations).map(([col, count]) => (
                                          <div key={col} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg text-sm border border-amber-100">
                                             <span className="font-medium text-amber-900">{col}</span>
                                             <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">{count} Duplicates</span>
                                          </div>
                                        ))}
                                        {/* Emails */}
                                        {Object.entries(report.data_profiling.email_violations).map(([col, count]) => (
                                          <div key={col} className="flex items-center justify-between p-3 bg-red-50 rounded-lg text-sm border border-red-100">
                                             <span className="font-medium text-red-900">{col}</span>
                                             <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">{count} Invalid Emails</span>
                                          </div>
                                        ))}
                                        {/* Dates */}
                                        {Object.entries(report.data_profiling.date_violations).map(([col, count]) => (
                                          <div key={col} className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg text-sm border border-indigo-100">
                                             <span className="font-medium text-indigo-900">{col}</span>
                                             <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold">{count} Invalid Dates</span>
                                          </div>
                                        ))}
                                        {/* Regex */}
                                        {Object.entries(report.data_profiling.regex_violations).map(([col, count]) => (
                                          <div key={col} className="flex items-center justify-between p-3 bg-rose-50 rounded-lg text-sm border border-rose-100">
                                             <span className="font-medium text-rose-900">{col}</span>
                                             <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs font-bold">{count} Pattern Mismatch</span>
                                          </div>
                                        ))}

                                        {Object.entries(report.data_profiling.uniqueness_violations).length === 0 && 
                                         Object.entries(report.data_profiling.email_violations).length === 0 &&
                                         Object.entries(report.data_profiling.date_violations).length === 0 &&
                                         Object.entries(report.data_profiling.regex_violations).length === 0 && (
                                          <div className="p-3 bg-emerald-50 rounded-lg flex items-center gap-2 text-emerald-700 text-sm font-medium">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Specialized Format Checks Passed
                                          </div>
                                        )}
                                      </div>
                                   </div>

                                   <div className="space-y-4">
                                      <SectionTitle icon={FileText}>Length Enforcement</SectionTitle>
                                      <div className="space-y-2">
                                        {(Object.entries(report.data_profiling.length_violations.column_details) as [string, any][]).length > 0 ? (
                                          (Object.entries(report.data_profiling.length_violations.column_details) as [string, any][]).map(([col, detail]) => (
                                            <div key={col} className="flex flex-col gap-1 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                                               <div className="flex justify-between items-center">
                                                 <span className="text-sm font-medium text-indigo-900">{col}</span>
                                                 <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold">{detail.violation_count} Violations</span>
                                               </div>
                                               <div className="flex justify-between text-[10px] text-indigo-500 uppercase font-medium mt-1">
                                                 <span>Allowed: {detail.allowed_length}</span>
                                                 <span>Max Found: {detail.max_found_length}</span>
                                               </div>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="p-3 bg-emerald-50 rounded-lg flex items-center gap-2 text-emerald-700 text-sm font-medium">
                                            <CheckCircle2 className="w-4 h-4" />
                                            No length violations
                                          </div>
                                        )}
                                      </div>
                                   </div>
                               </div>
                            </motion.div>
                          )}

                          {activeTab === 'structural' && (
                            <motion.div 
                              key="structural"
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              className="space-y-6"
                            >
                               <div className="space-y-4">
                                 <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-3">
                                      <AlertCircle className="w-5 h-5 text-amber-500" />
                                      <div>
                                        <p className="text-sm font-semibold">Delimiter Mismatches</p>
                                        <p className="text-xs text-slate-500">
                                          {report.structural_issues.delimiter_mismatches.length} rows found with incorrect column count (Expected: {report.file_health.column_count})
                                        </p>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={downloadBadRows}
                                      disabled={badRows.length === 0}
                                      className="text-xs font-bold text-indigo-600 uppercase tracking-widest px-3 py-1 bg-white border border-slate-200 rounded-lg hover:border-indigo-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      Export Flagged Rows ({badRows.length})
                                    </button>
                                 </div>

                                 {/* Empty Headers */}
                                 {report.structural_issues.empty_headers.length > 0 && (
                                   <div className="flex items-center gap-3 bg-red-50 p-4 rounded-xl border border-red-100">
                                     <AlertCircle className="w-5 h-5 text-red-500" />
                                     <div>
                                       <p className="text-sm font-semibold">Empty Headers Detected</p>
                                       <p className="text-xs text-slate-500">
                                         {report.structural_issues.empty_headers.length} columns have no header name. Indices: {report.structural_issues.empty_headers.map(idx => parseInt(idx) + 1).join(', ')}
                                       </p>
                                     </div>
                                   </div>
                                 )}

                                 {/* Unnamed Column Data */}
                                 {report.structural_issues.unnamed_column_data.length > 0 && (
                                   <div className="flex items-center gap-3 bg-amber-50 p-4 rounded-xl border border-amber-100">
                                     <FileWarning className="w-5 h-5 text-amber-500" />
                                     <div>
                                       <p className="text-sm font-semibold">Data in Unnamed Columns</p>
                                       <p className="text-xs text-slate-500">
                                         Found {report.structural_issues.unnamed_column_data.length} instances of data in columns with no header labels.
                                       </p>
                                     </div>
                                   </div>
                                 )}
                               </div>

                               <div className="max-h-[600px] overflow-auto border border-[#141414]">
                                  <table className="w-full text-left border-collapse">
                                    <thead className="bg-[#F1F0ED] text-[9px] font-bold uppercase text-[#141414] tracking-[0.2em] sticky top-0 border-b border-[#141414]">
                                      <tr>
                                        <th className="px-4 py-3">Row ID</th>
                                        <th className="px-4 py-3 text-center">Col Count</th>
                                        <th className="px-4 py-3 text-center">Reference</th>
                                        <th className="px-4 py-3">Audit Alert</th>
                                      </tr>
                                    </thead>
                                    <tbody className="text-[11px] font-mono">
                                      {report.structural_issues.delimiter_mismatches.map((issue, idx) => (
                                        <tr key={idx} className="border-b border-black/5 hover:bg-slate-50">
                                          <td className="px-4 py-3 font-bold">{issue.row}</td>
                                          <td className="px-4 py-3 text-center text-red-600 font-bold">{issue.found_cols}</td>
                                          <td className="px-4 py-3 text-center opacity-40">{issue.expected}</td>
                                          <td className="px-4 py-3">
                                            <span className="border border-red-600 text-red-600 px-1 py-0.5 text-[8px] font-bold uppercase">Structural Mismatch</span>
                                          </td>
                                        </tr>
                                      ))}
                                      {report.structural_issues.delimiter_mismatches.length === 0 && (
                                        <tr>
                                          <td colSpan={4} className="px-4 py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">Structural Integrity Nominal</td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                               </div>
                            </motion.div>
                          )}

                          {activeTab === 'hidden' && (
                            <motion.div 
                              key="hidden"
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              className="space-y-6"
                            >
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {(Object.entries(report.hidden_characters.summary_unique_ghost_codes_per_column) as [string, string[]][]).map(([col, ghosts]) => (
                                    <div key={col} className="bg-white border border-[#141414] p-4">
                                       <div className="flex items-center justify-between mb-3">
                                          <span className="text-[11px] font-bold text-[#141414] uppercase tracking-wider">{col}</span>
                                          <span className="text-[9px] bg-[#141414] text-white px-1.5 py-0.5 font-bold">{ghosts.length} TYPES</span>
                                       </div>
                                       <div className="flex flex-wrap gap-2">
                                          {ghosts.map(g => <code key={g} className="text-[10px] font-mono px-2 py-0.5 bg-slate-50 border border-slate-100">{g}</code>)}
                                       </div>
                                    </div>
                                  ))}
                                  {Object.keys(report.hidden_characters.summary_unique_ghost_codes_per_column).length === 0 && (
                                    <div className="col-span-2 py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No ghost character interference detected</div>
                                  )}
                               </div>

                               {report.hidden_characters.details.length > 0 && (
                                 <div className="space-y-4">
                                   <SectionTitle icon={Info}>Found Occurrences (Sample 100)</SectionTitle>
                                   <div className="max-h-[400px] overflow-auto border border-[#141414]">
                                      <table className="w-full text-left border-collapse">
                                        <thead className="bg-[#F1F0ED] text-[9px] font-bold uppercase text-[#141414] tracking-[0.2em] sticky top-0 border-b border-[#141414]">
                                          <tr>
                                            <th className="px-4 py-3">Row</th>
                                            <th className="px-4 py-3">Column</th>
                                            <th className="px-4 py-3">Ghost Codes</th>
                                          </tr>
                                        </thead>
                                        <tbody className="text-[11px] font-mono">
                                          {report.hidden_characters.details.slice(0, 100).map((detail, idx) => (
                                            <tr key={idx} className="border-b border-black/5 hover:bg-slate-50">
                                              <td className="px-4 py-3 font-bold">{detail.row}</td>
                                              <td className="px-4 py-3 opacity-60">{detail.column}</td>
                                              <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1">
                                                  {detail.ghost_character_codes.map(g => <code key={g} className="text-[9px] px-1 border border-red-600 text-red-600">{g}</code>)}
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                   </div>
                                 </div>
                               )}
                            </motion.div>
                          )}

                          {activeTab === 'data' && (
                             <motion.div 
                              key="data"
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              className="space-y-12"
                            >
                               {/* Validation Failure Log */}
                               <div className="space-y-4">
                                  <SectionTitle icon={ShieldAlert}>Validation Failure Log (Sample 200)</SectionTitle>
                                  <div className="max-h-[500px] overflow-auto border border-[#141414]">
                                    <table className="w-full text-left border-collapse">
                                      <thead className="bg-[#F1F0ED] text-[9px] font-bold uppercase text-[#141414] tracking-[0.2em] sticky top-0 border-b border-[#141414]">
                                        <tr>
                                          <th className="px-4 py-3">Row</th>
                                          <th className="px-4 py-3">Column</th>
                                          <th className="px-4 py-3">Found Value</th>
                                          <th className="px-4 py-3">Failure Reason</th>
                                        </tr>
                                      </thead>
                                      <tbody className="text-[11px] font-mono">
                                        {(report.data_profiling.violation_details || []).slice(0, 200).map((v, idx) => (
                                          <tr key={idx} className="border-b border-black/5 hover:bg-slate-50">
                                            <td className="px-4 py-3 font-bold">{v.row}</td>
                                            <td className="px-4 py-3 opacity-60 font-bold">{v.column}</td>
                                            <td className="px-4 py-3 truncate max-w-[200px]">{v.value || "[EMPTY]"}</td>
                                            <td className="px-4 py-3">
                                              <span className="text-red-600 font-bold uppercase text-[9px]">{v.reason}</span>
                                            </td>
                                          </tr>
                                        ))}
                                        {(report.data_profiling.violation_details || []).length === 0 && (
                                          <tr>
                                            <td colSpan={4} className="px-4 py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No validation failures found</td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                               </div>

                               {/* Distinct Profiles */}
                               {Object.keys(report.data_profiling.distinct_value_profiles).length > 0 && (
                                 <div className="space-y-6">
                                    <SectionTitle icon={LayoutGrid}>Value Distribution Profile</SectionTitle>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                       {Object.entries(report.data_profiling.distinct_value_profiles).map(([col, profiles]) => (
                                         <div key={col} className="bg-white border border-[#141414] p-6 shadow-none overflow-hidden">
                                            <h4 className="text-[11px] font-bold text-[#141414] uppercase tracking-widest mb-4 flex items-center gap-2">
                                              <Database className="w-3 h-3 opacity-30" />
                                              {col}
                                            </h4>
                                            <div className="space-y-2 max-h-[300px] overflow-auto pr-2">
                                               {Object.entries(profiles)
                                                 .sort((a, b) => b[1] - a[1])
                                                 .map(([val, count]) => (
                                                  <div key={val} className="group flex flex-col gap-1">
                                                     <div className="flex justify-between text-[11px] font-mono mb-1">
                                                        <span className={cn("truncate", val === "[EMPTY]" ? "opacity-30 italic" : "font-bold")}>{val}</span>
                                                        <span className="opacity-40">{count}</span>
                                                     </div>
                                                     <div className="w-full bg-slate-50 h-[3px] overflow-hidden">
                                                        <div 
                                                          className="bg-[#141414] h-full transition-all" 
                                                          style={{ width: `${Math.min(100, (count / report!.file_health.total_rows_scanned) * 100)}%` }} 
                                                        />
                                                     </div>
                                                  </div>
                                               ))}
                                            </div>
                                         </div>
                                       ))}
                                    </div>
                                 </div>
                               )}

                               {/* Nulls & Uniqueness */}
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-100">
                                  <div className="space-y-4">
                                     <SectionTitle icon={AlertCircle}>Field Analysis: Nulls</SectionTitle>
                                     <div className="space-y-3">
                                        {Object.entries(report.data_profiling.null_violations).length > 0 ? (
                                           Object.entries(report.data_profiling.null_violations).map(([col, count]) => (
                                              <div key={col} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100/50">
                                                 <span className="text-sm font-semibold">{col}</span>
                                                 <span className="bg-red-500 text-white px-2.5 py-1 rounded-full text-xs font-black">{count} Missing</span>
                                              </div>
                                           ))
                                        ) : <p className="text-sm text-slate-400 italic">No critical fields contain null values</p>}
                                     </div>
                                  </div>
                                  <div className="space-y-4">
                                     <SectionTitle icon={ShieldAlert}>Field Analysis: Uniqueness</SectionTitle>
                                     <div className="space-y-3">
                                        {Object.entries(report.data_profiling.uniqueness_violations).length > 0 ? (
                                           Object.entries(report.data_profiling.uniqueness_violations).map(([col, count]) => (
                                              <div key={col} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100/50">
                                                 <span className="text-sm font-semibold">{col}</span>
                                                 <span className="bg-amber-500 text-white px-2.5 py-1 rounded-full text-xs font-black">{count} Duplicates</span>
                                              </div>
                                           ))
                                        ) : <p className="text-sm text-slate-400 italic">No duplicates in unique fields</p>}
                                     </div>
                                  </div>
                               </div>
                             </motion.div>
                          )}

                          {activeTab === 'warnings' && (
                             <motion.div 
                              key="warnings"
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              className="space-y-8"
                            >
                               {/* Missing Column Warnings */}
                               <div className="space-y-4">
                                  <SectionTitle icon={AlertCircle}>Typo / Missing Column Warnings</SectionTitle>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     {[
                                       { label: 'Critical Fields', list: report.data_profiling.missing_critical_columns },
                                       { label: 'Unique Fields', list: report.data_profiling.missing_unique_check_columns },
                                       { label: 'Length Enforced', list: report.data_profiling.missing_length_check_columns },
                                       { label: 'Distinct Profiles', list: report.data_profiling.missing_distinct_check_columns },
                                       { label: 'Email Fields', list: report.data_profiling.missing_email_columns },
                                     ].map((item) => item.list.length > 0 && (
                                       <div key={item.label} className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">{item.label}</p>
                                          <div className="flex flex-wrap gap-2 text-xs font-medium text-amber-800">
                                             {item.list.map(f => <span key={f} className="bg-amber-100 px-2 py-0.5 rounded border border-amber-200">{f}</span>)}
                                          </div>
                                       </div>
                                     ))}
                                     {report.data_profiling.missing_critical_columns.length === 0 && 
                                      report.data_profiling.missing_unique_check_columns.length === 0 &&
                                      <div className="col-span-2 p-6 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center gap-3 font-medium">
                                        <CheckCircle2 className="w-5 h-5" />
                                        All configured validation columns were found in the file!
                                      </div>
                                     }
                                  </div>
                               </div>

                               {/* Excel Mutations */}
                               <div className="space-y-4">
                                  <SectionTitle icon={FileWarning}>Excel Mutations & Whitespace</SectionTitle>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     {Object.entries(report.data_profiling.excel_mutations).length > 0 && (
                                       <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                                          <div className="flex items-center gap-2 text-red-700">
                                            <AlertCircle className="w-4 h-4" />
                                            <p className="text-sm font-bold">Scientific Notation (E+)</p>
                                          </div>
                                          <p className="text-xs text-red-600 leading-relaxed">
                                            Excel likely corrupted these values into scientific notation (e.g., 1.23E+11). 
                                            Contact the data provider for original raw values.
                                          </p>
                                          {Object.entries(report.data_profiling.excel_mutations).map(([col, count]) => (
                                            <div key={col} className="flex justify-between text-xs bg-white/50 p-2 rounded">
                                              <span className="font-medium">{col}</span>
                                              <span className="font-black">{count}</span>
                                            </div>
                                          ))}
                                       </div>
                                     )}
                                     {Object.entries(report.data_profiling.whitespace_issues).length > 0 && (
                                        <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl space-y-3">
                                           <div className="flex items-center gap-2 text-slate-700">
                                             <Info className="w-4 h-4" />
                                             <p className="text-sm font-bold">Leading/Trailing Whitespace</p>
                                           </div>
                                           <p className="text-xs text-slate-500">
                                             Fields with extra spaces. Our audit logic used stripped values for violations, 
                                             but the raw file contains whitespace that might fail strictly typed schemas.
                                           </p>
                                           {Object.entries(report.data_profiling.whitespace_issues).map(([col, count]) => (
                                             <div key={col} className="flex justify-between text-xs bg-white/50 p-2 rounded font-mono text-slate-500">
                                               <span>{col}</span>
                                               <span>{count}</span>
                                             </div>
                                           ))}
                                        </div>
                                     )}
                                  </div>
                               </div>
                             </motion.div>
                          )}
                       </AnimatePresence>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="h-8 border-t border-[#141414] bg-[#141414] text-white flex items-center justify-between px-6 text-[9px] uppercase font-bold tracking-widest mt-auto">
        <div className="flex items-center gap-4">
          <ShieldAlert className="w-3 h-3" />
          <span>System State: {isAuditing ? 'Executing Scan' : 'Monitoring Idle'}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="opacity-40">Analytical Mode: Local-Only</span>
          <span>v2.4.0</span>
        </div>
      </footer>
    </div>
  );
}
