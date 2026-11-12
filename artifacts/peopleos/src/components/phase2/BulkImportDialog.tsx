import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGetPeopleOsOverviewQueryKey, getListEmployeesQueryKey } from '@workspace/api-client-react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, History, ShieldAlert, Upload, X } from 'lucide-react';
import { apiGet, apiPost, triggerCsvDownload } from '@/lib/api';

const SAMPLE_EMPLOYEE_CSV = `employeeNumber,firstName,lastName,workEmail,jobTitle,departmentCode,location,employmentType,startDate
REK-204,Faith,Mutuku,faith.mutuku@rekker-demo.invalid,Filling Line Operator,MFG,Nairobi Production Facility,permanent,2026-04-01
REK-205,Peter,Njoroge,peter.njoroge@rekker-demo.invalid,Warehouse Dispatch Clerk,LOG,Nairobi Production Facility,permanent,2026-04-01`;

const CANONICAL_FIELDS = [
  { key: 'employeeNumber', label: 'Employee Number', required: true },
  { key: 'firstName', label: 'First Name', required: true },
  { key: 'lastName', label: 'Last Name', required: true },
  { key: 'workEmail', label: 'Work Email', required: true },
  { key: 'jobTitle', label: 'Job Title', required: true },
  { key: 'departmentCode', label: 'Department Code', required: true },
  { key: 'location', label: 'Work Location', required: true },
  { key: 'employmentType', label: 'Employment Type', required: true },
  { key: 'startDate', label: 'Start Date', required: true },
  { key: 'personalEmail', label: 'Personal Email', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'managerEmployeeNumber', label: 'Manager Employee #', required: false },
  { key: 'positionCode', label: 'Position Code', required: false },
  { key: 'employeeCategory', label: 'Category (office/factory/etc)', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'probationEndDate', label: 'Probation End Date', required: false },
  { key: 'contractEndDate', label: 'Contract End Date', required: false },
  { key: 'timezone', label: 'Timezone', required: false },
];

export function BulkImportDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'import' | 'history'>('import');
  const [csvText, setCsvText] = useState(SAMPLE_EMPLOYEE_CSV);
  const [fileName, setFileName] = useState('rekker-employees.csv');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [profileName, setProfileName] = useState('');
  const [preview, setPreview] = useState<any | null>(null);
  const [commitResult, setCommitResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const profilesQuery = useQuery({
    queryKey: ['import-mapping-profiles'],
    queryFn: () => apiGet<{ items: any[] }>('/api/peopleos/employees/import-mapping-profiles'),
    enabled: open,
  });

  const batchesQuery = useQuery({
    queryKey: ['import-batches'],
    queryFn: () => apiGet<{ items: any[] }>('/api/peopleos/employees/import-batches'),
    enabled: open && tab === 'history',
  });

  const detectedHeaders = csvText
    .split(/\r?\n/)[0]
    ?.split(',')
    .map((h) => h.trim().replace(/^"|"$/g, ''))
    .filter(Boolean) ?? [];

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvText(reader.result);
        setPreview(null);
        setCommitResult(null);
        setErrorMsg(null);
      }
    };
    reader.readAsText(file);
  };

  const runPreview = async () => {
    setBusy(true);
    setErrorMsg(null);
    setCommitResult(null);
    try {
      const cleanedMap = Object.fromEntries(
        Object.entries(mapping).filter(([, csvCol]) => Boolean(csvCol)),
      );
      const data = await apiPost('/api/peopleos/employees/import-preview', {
        csvText,
        fileName,
        mapping: Object.keys(cleanedMap).length ? cleanedMap : undefined,
      });
      setPreview(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to parse and validate CSV.');
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    if (!preview?.batchId || !preview?.importToken) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const result = await apiPost('/api/peopleos/employees/import', {
        batchId: preview.batchId,
        importToken: preview.importToken,
      });
      setCommitResult(result);
      setPreview(null);
      qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetPeopleOsOverviewQueryKey() });
      qc.invalidateQueries({ queryKey: ['import-batches'] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Batch commit failed.');
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!profileName.trim()) return;
    try {
      await apiPost('/api/peopleos/employees/import-mapping-profiles', {
        name: profileName.trim(),
        mappingJson: mapping,
      });
      setProfileName('');
      profilesQuery.refetch();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save mapping profile.');
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen(true)}
        data-testid="button-open-bulk-import"
      >
        <Upload size={15} /> Bulk CSV Import
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          data-testid="dialog-bulk-employee-import"
        >
          <div className="max-h-[92dvh] w-full max-w-[920px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl md:p-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#C71D1D]">
                  Bulk Onboarding &amp; Staging Engine
                </p>
                <h2 className="font-display text-xl font-semibold text-stone-900">
                  Bulk Employee Import Centre
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTab('import')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === 'import' ? 'bg-[#C71D1D] text-white' : 'bg-stone-100 text-stone-700'}`}
                >
                  Import Wizard
                </button>
                <button
                  type="button"
                  onClick={() => setTab('history')}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === 'history' ? 'bg-[#C71D1D] text-white' : 'bg-stone-100 text-stone-700'}`}
                >
                  <History size={13} /> Batch History
                </button>
                <button
                  type="button"
                  className="btn btn-ghost min-h-8 px-2"
                  onClick={() => setOpen(false)}
                  aria-label="Close bulk import dialog"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {tab === 'import' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-[#faf8f5] p-3 text-xs">
                  <div className="flex items-center gap-2 text-stone-600">
                    <FileSpreadsheet size={16} className="text-[#C71D1D]" />
                    <span>RFC-4180 CSV parser with strict validation and HMAC commit token.</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void triggerCsvDownload(
                          '/api/peopleos/employees/import-template?kind=standard',
                          'rekker-employee-import-template.csv',
                        )
                      }
                      className="btn btn-secondary min-h-8 px-2.5 text-xs"
                    >
                      <Download size={13} /> CSV Template
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void triggerCsvDownload(
                          '/api/peopleos/employees/import-template?kind=starter_guide',
                          'rekker-employee-import-starter-guide.csv',
                        )
                      }
                      className="btn btn-secondary min-h-8 px-2.5 text-xs"
                    >
                      <Download size={13} /> Starter Guide
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-[#ead4b1] bg-[#fbf3e4] p-3 text-xs text-[#6f5a30]">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>Privacy &amp; Payroll Boundary:</strong> Sensitive statutory IDs (`nationalId`, `kraPin`, `nssfNo`, `shaNo`), bank accounts, and salary columns are blocked from bulk CSV import and must use encrypted onboarding or payroll workflows.
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block">
                      <span className="label">Upload CSV File</span>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => handleFileChange(e.target.files?.[0])}
                        className="mt-1 block w-full text-xs text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-stone-700 hover:file:bg-stone-200"
                      />
                    </label>
                    <label className="mt-3 block">
                      <span className="label">Or Paste RFC-4180 CSV ({fileName})</span>
                      <textarea
                        value={csvText}
                        onChange={(e) => {
                          setCsvText(e.target.value);
                          setPreview(null);
                        }}
                        rows={7}
                        className="field mt-1 font-mono text-xs"
                        data-testid="textarea-bulk-csv"
                      />
                    </label>
                  </div>

                  <div className="rounded-xl border border-stone-200 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                        Column Mapping
                      </span>
                      {profilesQuery.data?.items?.length ? (
                        <select
                          aria-label="Apply saved mapping profile"
                          className="field max-w-[190px] py-1 text-xs"
                          onChange={(e) => {
                            const found = profilesQuery.data?.items?.find((p) => p.id === e.target.value);
                            if (found) setMapping(found.mapping ?? {});
                          }}
                          defaultValue=""
                        >
                          <option value="">Load saved profile…</option>
                          {profilesQuery.data.items.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                    <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1 text-xs">
                      {CANONICAL_FIELDS.map((f) => (
                        <div key={f.key} className="flex items-center justify-between gap-2">
                          <span className="text-stone-600">
                            {f.label}
                            {f.required ? <span className="text-[#C71D1D]"> *</span> : null}
                          </span>
                          <select
                            aria-label={`Map ${f.label}`}
                            value={mapping[f.key] ?? ''}
                            onChange={(e) =>
                              setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))
                            }
                            className="field max-w-[170px] py-1 text-xs"
                          >
                            <option value="">Auto ({f.key})</option>
                            {detectedHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-stone-100 pt-2.5">
                      <input
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="Profile name (e.g. Factory CSV)"
                        className="field py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={saveProfile}
                        disabled={!profileName.trim()}
                        className="btn btn-secondary min-h-8 shrink-0 px-2.5 text-xs"
                      >
                        Save Map
                      </button>
                    </div>
                  </div>
                </div>

                {errorMsg && (
                  <div className="flex items-start gap-2 rounded-xl border border-[#f2c8c8] bg-[#fdf2f2] p-3 text-xs text-[#9b1c1c]">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {commitResult && (
                  <div className="flex items-center gap-2 rounded-xl border border-[#b9dfc6] bg-[#e8f2eb] p-3 text-xs text-[#235436]">
                    <CheckCircle2 size={16} />
                    <span>
                      Imported <strong>{commitResult.createdCount ?? 0}</strong> employee record(s) atomically. Batch ID: <code>{commitResult.batchId}</code>
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
                  <button
                    type="button"
                    disabled={busy || !csvText.trim()}
                    onClick={runPreview}
                    className="btn btn-secondary"
                    data-testid="button-preview-import"
                  >
                    {busy ? 'Validating…' : 'Stage & Validate CSV'}
                  </button>
                  {preview && (
                    <div className="flex flex-wrap items-center gap-2">
                      {preview.errorCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            void triggerCsvDownload(
                              `/api/peopleos/employees/import-batches/${preview.batchId}/errors.csv`,
                              `import-errors-${preview.batchId.slice(0, 8)}.csv`,
                            )
                          }
                          className="btn btn-secondary text-xs"
                        >
                          <Download size={13} /> Error CSV
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy || preview.state !== 'READY_FOR_COMMIT' || preview.validCount === 0}
                        onClick={runCommit}
                        className="btn btn-primary"
                        data-testid="button-commit-import"
                      >
                        Commit {preview.validCount} Valid Record(s)
                      </button>
                    </div>
                  )}
                </div>

                {preview && (
                  <div className="rounded-xl border border-stone-200 p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#e8f2eb] px-2.5 py-0.5 font-bold text-[#34734d]">
                          Valid: {preview.validCount}
                        </span>
                        <span className="rounded-full bg-[#fbf0da] px-2.5 py-0.5 font-bold text-[#785716]">
                          Duplicates: {preview.duplicateCount}
                        </span>
                        <span className="rounded-full bg-[#fdf2f2] px-2.5 py-0.5 font-bold text-[#a91919]">
                          Errors: {preview.errorCount}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-stone-500">
                        State: {preview.state} · Token Expires {new Date(preview.expiresAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="max-h-60 overflow-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-stone-200 text-[10px] uppercase tracking-wider text-stone-400">
                            <th className="py-2 pr-2">#</th>
                            <th className="py-2 pr-2">Emp #</th>
                            <th className="py-2 pr-2">Name</th>
                            <th className="py-2 pr-2">Dept</th>
                            <th className="py-2 pr-2">Type</th>
                            <th className="py-2 pr-2">Status</th>
                            <th className="py-2">Validation Messages</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {(preview.rows ?? []).map((r: any) => (
                            <tr key={r.rowNumber}>
                              <td className="py-2 pr-2 font-mono text-stone-400">{r.rowNumber}</td>
                              <td className="py-2 pr-2 font-mono">{r.employeeNumber || '—'}</td>
                              <td className="py-2 pr-2 font-semibold">{r.fullName || '—'}</td>
                              <td className="py-2 pr-2">{r.departmentCode || '—'}</td>
                              <td className="py-2 pr-2">{r.employmentType || '—'}</td>
                              <td className="py-2 pr-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    r.status === 'valid'
                                      ? 'bg-[#e8f2eb] text-[#34734d]'
                                      : r.status === 'duplicate'
                                        ? 'bg-[#fbf0da] text-[#785716]'
                                        : 'bg-[#fdf2f2] text-[#a91919]'
                                  }`}
                                >
                                  {r.status}
                                </span>
                              </td>
                              <td className="py-2 text-[11px]">
                                {(r.errors ?? []).map((e: string, i: number) => (
                                  <div key={`e-${i}`} className="text-[#a91919]">
                                    • {e}
                                  </div>
                                ))}
                                {(r.warnings ?? []).map((w: string, i: number) => (
                                  <div key={`w-${i}`} className="text-[#785716]">
                                    ⚠ {w}
                                  </div>
                                ))}
                                {!r.errors?.length && !r.warnings?.length && (
                                  <span className="text-[#34734d]">Ready</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {batchesQuery.isLoading ? (
                  <p className="text-xs text-stone-500">Loading batch history…</p>
                ) : !(batchesQuery.data?.items?.length) ? (
                  <p className="rounded-xl bg-stone-50 p-6 text-center text-xs text-stone-500">
                    No staged or committed import batches recorded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 text-[10px] uppercase tracking-wider text-stone-400">
                          <th className="py-2 pr-3">File</th>
                          <th className="py-2 pr-3">State</th>
                          <th className="py-2 pr-3">Valid / Err / Committed</th>
                          <th className="py-2 pr-3">Created</th>
                          <th className="py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {batchesQuery.data.items.map((b: any) => (
                          <tr key={b.id}>
                            <td className="py-2.5 pr-3 font-semibold text-stone-800">{b.fileName}</td>
                            <td className="py-2.5 pr-3 font-mono text-[11px]">{b.state}</td>
                            <td className="py-2.5 pr-3">
                              {b.validRows} / {b.errorRows} / {b.committedRows}
                            </td>
                            <td className="py-2.5 pr-3 text-stone-500">
                              {new Date(b.createdAt).toLocaleString()}
                            </td>
                            <td className="py-2.5">
                              <button
                                type="button"
                                onClick={() =>
                                  void triggerCsvDownload(
                                    `/api/peopleos/employees/import-batches/${b.id}/errors.csv`,
                                    `batch-${b.id.slice(0, 8)}-errors.csv`,
                                  )
                                }
                                className="btn btn-secondary min-h-7 px-2 text-[11px]"
                              >
                                <Download size={12} /> Error CSV
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

