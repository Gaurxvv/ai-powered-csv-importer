import React, { useMemo, useState } from 'react';

interface CsvVirtualTableProps {
  headers: string[];
  rows: Array<{ sourceRowIndex: number; raw: Record<string, string> }>;
}

export default function CsvVirtualTable({ headers, rows }: CsvVirtualTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    return rows.filter(row =>
      Object.values(row.raw).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [rows, searchTerm]);

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search preview rows..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-sm px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[500px]">
        <table className="w-full border-collapse text-left text-sm text-slate-600 dark:text-slate-400">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900 z-10 text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wider border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                # Index
              </th>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-6 py-3 font-semibold text-xs uppercase tracking-wider border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 min-w-[150px]"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-950">
            {filteredRows.slice(0, 500).map((row, index) => (
              <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                <td className="px-6 py-4 font-mono text-xs border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-slate-500 sticky left-0">
                  {row.sourceRowIndex + 1}
                </td>
                {headers.map((header) => (
                  <td
                    key={header}
                    className="px-6 py-4 truncate max-w-[250px] border-r border-slate-200 dark:border-slate-800"
                    title={row.raw[header]}
                  >
                    {row.raw[header] || <span className="text-slate-300 dark:text-slate-700 italic">-</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredRows.length > 500 && (
          <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-800">
            Showing first 500 rows of {filteredRows.length} total.
          </div>
        )}

        {filteredRows.length === 0 && (
          <div className="p-12 text-center text-slate-400 dark:text-slate-600">
            No rows found matching search term.
          </div>
        )}
      </div>
    </div>
  );
}
