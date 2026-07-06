'use client';

import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import CsvVirtualTable from '../components/CsvVirtualTable';
import { UploadCloud, AlertTriangle, Moon, Sun, ArrowRight, RefreshCw, FileText, Check, Database } from 'lucide-react';
import { RawRow, CrmRecord, SkippedRow } from '@groweasy/shared';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

type Step = 'UPLOAD' | 'PREVIEW' | 'PROCESSING' | 'RESULT';

export default function Home() {
  const [darkMode, setDarkMode] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('UPLOAD');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('PENDING');
  const [totalBatches, setTotalBatches] = useState(0);
  const [completedBatches, setCompletedBatches] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [imported, setImported] = useState<CrmRecord[]>([]);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [jobError, setJobError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [resultTab, setResultTab] = useState<'imported' | 'skipped'>('imported');
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    if (step !== 'PROCESSING') {
      setDisplayProgress(0);
      return;
    }
    // Target is slightly below 100% until it actually completes
    const baseProgress = totalBatches > 0 ? (completedBatches / totalBatches) * 100 : 0;
    const target = totalBatches > 0 
      ? Math.min(((completedBatches + 0.95) / totalBatches) * 100, 95) 
      : 0;

    // Slowly crawl progress up to target
    const interval = setInterval(() => {
      setDisplayProgress((prev) => {
        if (prev < target) {
          return Math.min(prev + (target - prev) * 0.05 + 0.5, target);
        }
        return prev;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [step, completedBatches, totalBatches]);

  useEffect(() => {
    if (step === 'RESULT') {
      setDisplayProgress(100);
    }
  }, [step]);

  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark' || 
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDarkMode(isDark);
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const isDark = !darkMode;
    setDarkMode(isDark);
    if (isDark) {
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (selectedFile: File) => {
    setParseError(null);
    const extension = selectedFile.name.split('.').pop()?.toLowerCase();
    if (extension !== 'csv') {
      setParseError('Please upload a valid CSV file (.csv)');
      return;
    }
    setFile(selectedFile);

    Papa.parse<Record<string, string>>(selectedFile, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        if (results.errors.length > 0) {
          setParseError(`Failed to parse CSV: ${results.errors[0].message}`);
          return;
        }
        const detectedHeaders = results.meta.fields || [];
        if (detectedHeaders.length === 0) {
          setParseError('Empty or invalid header row in CSV');
          return;
        }
        const parsedRows: RawRow[] = results.data
          .map((row, index) => {
            const cleanRow: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
              if (key) {
                cleanRow[key] = String(value).trim();
              }
            }
            return { sourceRowIndex: index, raw: cleanRow };
          })
          .filter(r => Object.keys(r.raw).length > 0);

        if (parsedRows.length === 0) {
          setParseError('No valid data rows found in CSV');
          return;
        }
        setHeaders(detectedHeaders);
        setRows(parsedRows);
        setStep('PREVIEW');
      },
      error: (error) => {
        setParseError(`CSV Parse Error: ${error.message}`);
      }
    });
  };

  const startImport = async () => {
    setJobError(null);
    setStep('PROCESSING');
    setStatus('PENDING');
    setCompletedBatches(0);
    setTotalBatches(0);
    setImported([]);
    setSkipped([]);

    try {
      const response = await fetch(`${BACKEND_URL}/api/import/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, headers })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to initialize mapping extraction');
      }

      const { jobId } = await response.json();
      setJobId(jobId);

      const eventSource = new EventSource(`${BACKEND_URL}/api/import/status/${jobId}`);
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setStatus(data.status);
        setTotalBatches(data.totalBatches);
        setCompletedBatches(data.completedBatches);
        setTotalRows(data.totalRows);
        setImported(data.imported || []);
        setSkipped(data.skipped || []);
      };

      eventSource.addEventListener('end', () => {
        eventSource.close();
        setStep('RESULT');
      });

      eventSource.onerror = () => {
        eventSource.close();
        if (completedBatches > 0 && completedBatches === totalBatches) {
          setStep('RESULT');
        } else {
          setJobError('SSE stream interrupted. Please check connection or retry.');
          setStep('PREVIEW');
        }
      };
    } catch (error) {
      setJobError((error as Error).message);
      setStep('PREVIEW');
    }
  };

  const handleReset = () => {
    setFile(null);
    setHeaders([]);
    setRows([]);
    setParseError(null);
    setJobId(null);
    setStatus('PENDING');
    setTotalBatches(0);
    setCompletedBatches(0);
    setImported([]);
    setSkipped([]);
    setJobError(null);
    setStep('UPLOAD');
  };

  // Helper to render CRM status pill
  const renderStatusPill = (statusStr: string) => {
    const statusVal = statusStr.trim();
    if (!statusVal) return <span className="text-slate-300 dark:text-slate-700 italic">-</span>;

    if (statusVal === 'SALE_DONE') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50">
          Sale Done
        </span>
      );
    }
    if (statusVal === 'GOOD_LEAD_FOLLOW_UP') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50">
          Good Lead
        </span>
      );
    }
    if (statusVal === 'DID_NOT_CONNECT') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/50">
          Not Dialed
        </span>
      );
    }
    if (statusVal === 'BAD_LEAD') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/50">
          Bad Lead
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {statusVal}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-[#0b0f17] transition-colors duration-200 font-sans antialiased text-slate-800 dark:text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-100 dark:border-slate-900 bg-white dark:bg-[#111622] sticky top-0 z-40 transition-colors">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#0f5144] text-white p-2.5 rounded-xl flex items-center justify-center">
              <Database size={20} />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-slate-900 dark:text-white leading-none">
                GrowEasy Importer
              </h1>
              <p className="text-xs text-slate-400 mt-1">Intelligent Lead Mapper</p>
            </div>
          </div>
          
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-slate-500" />}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Title */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Manage Your Leads</h2>
            <p className="text-sm text-slate-400 mt-1">Monitor lead status, assign tasks, and close deals faster.</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex justify-center items-center gap-4 md:gap-8 mb-12 max-w-4xl mx-auto">
          {[
            { label: 'Upload CSV', value: 'UPLOAD' },
            { label: 'Preview Data', value: 'PREVIEW' },
            { label: 'Processing', value: 'PROCESSING' },
            { label: 'Result Schema', value: 'RESULT' }
          ].map((s, idx) => {
            const isActive = step === s.value;
            const isCompleted = 
              (step === 'PREVIEW' && idx === 0) ||
              (step === 'PROCESSING' && idx < 2) ||
              (step === 'RESULT' && idx < 3);

            return (
              <React.Fragment key={s.value}>
                {idx > 0 && (
                  <div className={`h-[2px] w-12 sm:w-20 md:w-28 transition-colors ${
                    (isCompleted || isActive) ? 'bg-[#0f5144]' : 'bg-slate-200 dark:bg-slate-800'
                  }`} />
                )}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition duration-300 ${
                      isActive
                        ? 'bg-[#0f5144] text-white shadow-md ring-4 ring-[#0f5144]/15 scale-110'
                        : isCompleted
                        ? 'bg-[#0f5144] text-white'
                        : 'bg-white dark:bg-[#111622] text-slate-400 border-2 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {isCompleted ? <Check size={16} className="stroke-[3px]" /> : idx + 1}
                  </div>
                  <span
                    className={`hidden lg:inline text-xs font-bold uppercase tracking-wider ${
                      isActive ? 'text-[#0f5144]' : isCompleted ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Action Panel */}
        <div className="bg-white dark:bg-[#111622] border border-slate-100 dark:border-slate-900 rounded-xl shadow-sm overflow-hidden">
          
          {/* UPLOAD STEP */}
          {step === 'UPLOAD' && (
            <div className="p-8 md:p-12 text-center">
              <div className="max-w-md mx-auto">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Upload lead-export</h3>
                <p className="text-xs text-slate-400 mb-6">
                  Supports any CSV layout. AI automatically extracts names, phone numbers, and maps them to GrowEasy.
                </p>

                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border border-dashed rounded-lg p-10 flex flex-col items-center justify-center cursor-pointer transition ${
                    dragActive
                      ? 'border-[#0f5144] bg-[#0f5144]/5'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                  onClick={() => document.getElementById('file-input')?.click()}
                >
                  <UploadCloud size={32} className="text-[#0f5144] mb-3" />
                  <p className="font-semibold text-xs text-slate-700 dark:text-slate-300">
                    Click to select, or drag your file here
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">CSV files only (Max 20k rows)</p>
                  <input
                    id="file-input"
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {parseError && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-rose-500 bg-rose-500/5 px-3 py-2 rounded-lg text-xs">
                    <AlertTriangle size={14} />
                    <span>{parseError}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PREVIEW STEP */}
          {step === 'PREVIEW' && (
            <div className="p-6">
              <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-[#0f5144]" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-none">
                      {file?.name}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {rows.length} rows loaded client-side
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                  >
                    Back
                  </button>
                  <button
                    onClick={startImport}
                    className="px-4 py-1.5 bg-[#0f5144] hover:bg-[#0c4036] text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition"
                  >
                    Confirm & Import
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {jobError && (
                <div className="mb-4 flex items-center gap-2 text-rose-500 bg-rose-500/5 px-3 py-2 rounded-lg text-xs">
                  <AlertTriangle size={14} />
                  <span>{jobError}</span>
                </div>
              )}

              <CsvVirtualTable headers={headers} rows={rows} />
            </div>
          )}

          {/* PROCESSING STEP */}
          {step === 'PROCESSING' && (
            <div className="p-16 text-center max-w-lg mx-auto">
              <RefreshCw className="animate-spin text-[#0f5144] mx-auto mb-5" size={32} />
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Mapping fields with AI</h3>
              <p className="text-xs text-slate-400 mb-8">
                Analyzing layout and matching contacts. Please hold on.
              </p>

              {totalBatches > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-semibold text-slate-500">
                    <span>Batch progress</span>
                    <span>
                      {completedBatches} / {totalBatches} ({Math.round(displayProgress)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0f5144] h-full rounded-full transition-all duration-300"
                      style={{ width: `${displayProgress}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-400 flex justify-between pt-1">
                    <span>Status: {status}</span>
                    <span>{rows.length} leads</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RESULT STEP */}
          {step === 'RESULT' && (
            <div className="p-6">
              
              {/* Simplified Stat Cards */}
              <div className="grid grid-cols-3 gap-3 mb-6 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <div className="text-center">
                  <span className="block text-xl font-bold text-slate-900 dark:text-white">{rows.length}</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Total Rows</span>
                </div>
                <div className="text-center border-x border-slate-200 dark:border-slate-800">
                  <span className="block text-xl font-bold text-emerald-600 dark:text-emerald-400">{imported.length}</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-emerald-500">Imported</span>
                </div>
                <div className="text-center">
                  <span className="block text-xl font-bold text-rose-500">{skipped.length}</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-rose-400">Skipped</span>
                </div>
              </div>

              {/* Tabs Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-2">
                <div className="flex gap-1.5 bg-slate-50 dark:bg-slate-900/60 p-1 rounded-lg border border-slate-100 dark:border-slate-800/50">
                  <button
                    onClick={() => setResultTab('imported')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      resultTab === 'imported'
                        ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Successfully Imported ({imported.length})
                  </button>
                  <button
                    onClick={() => setResultTab('skipped')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      resultTab === 'skipped'
                        ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Skipped Rows ({skipped.length})
                  </button>
                </div>

                <button
                  onClick={handleReset}
                  className="px-3.5 py-1.5 bg-[#0f5144] hover:bg-[#0c4036] text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <RefreshCw size={12} />
                  Import Another File
                </button>
              </div>

              {/* Imported Records Tab */}
              {resultTab === 'imported' && (
                <div className="overflow-auto border border-slate-100 dark:border-slate-800/80 rounded-lg max-h-[400px]">
                  {imported.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No records were successfully imported.
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left text-xs text-slate-600 dark:text-slate-400">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-2.5 font-bold">Row</th>
                          <th className="px-4 py-2.5 font-bold">Lead Name</th>
                          <th className="px-4 py-2.5 font-bold">Email</th>
                          <th className="px-4 py-2.5 font-bold">Contact</th>
                          <th className="px-4 py-2.5 font-bold">Company</th>
                          <th className="px-4 py-2.5 font-bold">Status</th>
                          <th className="px-4 py-2.5 font-bold">Source</th>
                          <th className="px-4 py-2.5 font-bold">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 bg-white dark:bg-[#111622]">
                        {imported.map((record, index) => (
                          <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                            <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{record.sourceRowIndex + 1}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{record.name}</td>
                            <td className="px-4 py-3 text-slate-500">{record.email}</td>
                            <td className="px-4 py-3 text-slate-500">
                              {record.country_code ? `${record.country_code} ` : ''}{record.mobile_without_country_code}
                            </td>
                            <td className="px-4 py-3 text-slate-400">{record.company || <span className="text-slate-300 dark:text-slate-700">-</span>}</td>
                            <td className="px-4 py-3">{renderStatusPill(record.crm_status)}</td>
                            <td className="px-4 py-3 text-slate-400">{record.data_source || <span className="text-slate-300 dark:text-slate-700">-</span>}</td>
                            <td className="px-4 py-3 truncate max-w-[200px] text-slate-400" title={record.crm_note}>{record.crm_note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Skipped Rows Tab */}
              {resultTab === 'skipped' && (
                <div className="overflow-auto border border-slate-100 dark:border-slate-800/80 rounded-lg max-h-[400px]">
                  {skipped.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No rows were skipped.
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left text-xs text-slate-600 dark:text-slate-400">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-2.5 font-bold">Row</th>
                          <th className="px-4 py-2.5 font-bold text-rose-500">Reason</th>
                          <th className="px-4 py-2.5 font-bold">Raw Snapshot</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 bg-white dark:bg-[#111622]">
                        {skipped.map((skip, index) => (
                          <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                            <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{skip.rowIndex + 1}</td>
                            <td className="px-4 py-3 text-rose-500 font-semibold">{skip.reason}</td>
                            <td className="px-4 py-3 font-mono text-[10px] text-slate-400">
                              {JSON.stringify(skip.row.raw)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
