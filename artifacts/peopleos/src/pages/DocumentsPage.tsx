import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Filter, AlertTriangle, X, Eye } from 'lucide-react';
import { useGetAuthContext, useListEmployees } from '@workspace/api-client-react';
import { apiGet, apiPost } from '../lib/api';

export function DocumentsPage() {
  const auth = useGetAuthContext();
  const employees = useListEmployees({ page: 1, pageSize: 50 });
  const qc = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [contractTemplateEmpId, setContractTemplateEmpId] = useState<string | null>(null);
  const [newDocName, setNewDocName] = useState('');
  const [newCategory, setNewCategory] = useState('Contract');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const docsQuery = useQuery({
    queryKey: ['documents'],
    queryFn: () => apiGet('/api/documents'),
  });
  const expiringQuery = useQuery({
    queryKey: ['documents-expiring'],
    queryFn: () => apiGet('/api/documents/expiring'),
  });
  const contractQuery = useQuery({
    queryKey: ['doc-contract-template', contractTemplateEmpId],
    queryFn: () => apiGet(`/api/documents/templates/employment-contract/${contractTemplateEmpId}`),
    enabled: Boolean(contractTemplateEmpId),
  });

  const docs: any[] = docsQuery.data?.items ?? [];
  const filtered = categoryFilter === 'all' ? docs : docs.filter(d => d.category === categoryFilter);
  const canManageDocs = Boolean(auth.data?.canManagePeople);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    try {
      await apiPost('/api/documents', { name: newDocName, category: newCategory });
      setNewDocName('');
      setShowUploadModal(false);
      qc.invalidateQueries({ queryKey: ['documents'] });
    } catch (err: any) {
      setUploadError(err?.message || 'Disallowed file format or missing title.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Records & Legal Vault</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">Documents & Contracts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Secure contract storage with extension sanitization, KRA P9 filings, and Kenyan Employment Act §10 contract generation.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={!employees.data?.items?.[0]?.id}
            onClick={() => {
              const firstId = employees.data?.items?.[0]?.id;
              if (firstId) setContractTemplateEmpId(firstId);
            }}
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            <Eye size={14} /> Employment Act §10 Template
          </button>
          {canManageDocs && (
            <button onClick={() => setShowUploadModal(true)} className="btn btn-primary text-xs">
              <Plus size={14} /> Upload Document
            </button>
          )}
        </div>
      </div>

      {(expiringQuery.data?.totalExpiring ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
          <AlertTriangle size={18} className="shrink-0 text-amber-700" />
          <div>
            <p className="font-bold">{expiringQuery.data.totalExpiring} Fixed-Term Contract(s) Expiring Within 60 Days</p>
            <p>{expiringQuery.data.contracts.map((c: any) => `${c.employee} (${c.expiryDate})`).join(', ')}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-stone-400" />
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="field min-h-8 w-52 text-xs font-semibold">
            <option value="all">All Documents ({docs.length})</option>
            <option value="Contract">Contracts & NDAs</option>
            <option value="Tax & KRA">Tax & KRA Certificates</option>
            <option value="Compliance">Compliance & ISO</option>
          </select>
        </div>
        <span className="text-xs text-stone-400">{filtered.length} records</span>
      </div>

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase text-stone-500">
              <tr><th className="px-4 py-3">Document Title</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Expiry</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 font-semibold text-stone-900 flex items-center gap-2"><FileText size={14} className="text-stone-400" />{d.name}</td>
                  <td className="px-4 py-3 text-stone-600">{d.category}</td>
                  <td className="px-4 py-3 text-stone-800">{d.employeeName || 'Employee'}</td>
                  <td className="px-4 py-3 text-stone-500">{d.expiryDate || 'Permanent'}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${d.status === 'valid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{String(d.status).replace('_', ' ').toUpperCase()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold">Register Workforce Document</h3>
              <button onClick={() => setShowUploadModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleUpload} className="mt-4 space-y-3 text-xs">
              <div><label className="label">File Title (Allowed: .pdf, .docx, .csv, .png, .jpg)</label><input required value={newDocName} onChange={e => setNewDocName(e.target.value)} className="field" placeholder="e.g., Employment_Contract_2026.pdf" /></div>
              <div><label className="label">Category</label><select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="field"><option>Contract</option><option>Tax & KRA</option><option>Compliance</option></select></div>
              {uploadError && <p className="text-red-700 font-semibold">{uploadError}</p>}
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowUploadModal(false)} className="btn btn-secondary text-xs">Cancel</button><button type="submit" className="btn btn-primary text-xs">Register Document</button></div>
            </form>
          </div>
        </div>
      )}

      {contractTemplateEmpId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold">Kenya Employment Act §10 Written Particulars</h3>
              <button onClick={() => setContractTemplateEmpId(null)}><X size={18} /></button>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <select value={contractTemplateEmpId} onChange={e => setContractTemplateEmpId(e.target.value)} className="field">
                {(employees.data?.items ?? []).map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
              </select>
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50 p-4 font-mono text-[11px] leading-relaxed">
                {contractQuery.data?.content || 'Loading Kenyan Employment Act §10 template...'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
