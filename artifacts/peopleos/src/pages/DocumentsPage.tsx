import React, { useState } from 'react';
import {
  FileText, Download, Eye, Plus, Search, Filter, ShieldCheck,
  AlertTriangle, Clock, CheckCircle2, X
} from 'lucide-react';
import { peopleOsStore } from '../data/mockStore';

export interface DocumentItem {
  id: string;
  name: string;
  category: 'Contract' | 'Tax & KRA' | 'Compliance' | 'Health & Safety';
  employeeName: string;
  uploadedDate: string;
  expiryDate?: string | null;
  fileSize: string;
  status: 'valid' | 'expiring_soon' | 'expired';
}

const INITIAL_DOCS: DocumentItem[] = [
  { id: 'doc-01', name: 'Executive Employment Agreement - Plant Operations.pdf', category: 'Contract', employeeName: 'Achieng Odhiambo', uploadedDate: '2021-03-15', expiryDate: null, fileSize: '2.4 MB', status: 'valid' },
  { id: 'doc-02', name: 'Fixed-Term Commercial Specialist Contract.pdf', category: 'Contract', employeeName: 'Brian Kiprotich', uploadedDate: '2024-02-01', expiryDate: '2026-04-30', fileSize: '1.8 MB', status: 'expiring_soon' },
  { id: 'doc-03', name: 'KRA Personal Tax Exemption & P9 Certificate 2025.pdf', category: 'Tax & KRA', employeeName: 'David Kibet', uploadedDate: '2026-01-10', expiryDate: '2026-12-31', fileSize: '850 KB', status: 'valid' },
  { id: 'doc-04', name: 'Brewery Fermentation OSHA & HACCP Certification.pdf', category: 'Compliance', employeeName: 'Mwangi Kariuki', uploadedDate: '2025-06-12', expiryDate: '2027-06-12', fileSize: '3.1 MB', status: 'valid' },
  { id: 'doc-05', name: 'Commercial Driver Medical & Safety Clearance.pdf', category: 'Health & Safety', employeeName: 'Juma Omondi', uploadedDate: '2025-09-01', expiryDate: '2026-09-01', fileSize: '1.2 MB', status: 'valid' },
];

export function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentItem[]>(INITIAL_DOCS);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newCategory, setNewCategory] = useState<DocumentItem['category']>('Contract');

  const filtered = categoryFilter === 'all'
    ? docs
    : docs.filter((d) => d.category === categoryFilter);

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName.trim()) return;

    const newDoc: DocumentItem = {
      id: `doc-${Date.now()}`,
      name: newDocName.endsWith('.pdf') ? newDocName : `${newDocName}.pdf`,
      category: newCategory,
      employeeName: 'David Kibet',
      uploadedDate: new Date().toISOString().slice(0, 10),
      fileSize: '1.5 MB',
      status: 'valid',
    };

    setDocs([newDoc, ...docs]);
    setShowUploadModal(false);
    setNewDocName('');
  };

  return (
    <div className="space-y-6">
      {/* Top Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Records & Governance</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]">
            Documents & Contracts
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Secure employee contract vault, statutory tax documentation, and automated expiry notifications.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUploadModal(true)}
            className="btn btn-primary flex items-center gap-2 text-xs font-semibold"
          >
            <Plus size={15} /> Upload Document
          </button>
        </div>
      </div>

      {/* Contract Expiry Alert Banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-xs">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <AlertTriangle size={20} />
        </div>
        <div className="flex-1">
          <h3 className="text-xs font-bold text-amber-900">Fixed-term Contract Expiration Alert</h3>
          <p className="mt-0.5 text-xs text-amber-800">
            Brian Kiprotich's employment agreement expires on <strong>2026-04-30</strong> (in 54 days). Prepare renewal or transition notification.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-stone-400" />
          <span className="text-xs font-bold text-stone-700">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700"
          >
            <option value="all">All Documents ({docs.length})</option>
            <option value="Contract">Contracts & NDAs</option>
            <option value="Tax & KRA">Tax & KRA Certificates</option>
            <option value="Compliance">Compliance & ISO</option>
            <option value="Health & Safety">Health & Safety Badges</option>
          </select>
        </div>
        <span className="text-xs text-stone-400">
          Showing {filtered.length} verified records
        </span>
      </div>

      {/* Documents Table */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3">Document Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Uploaded</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-stone-50/70 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-semibold text-stone-900">
                      <FileText size={15} className="text-stone-400 shrink-0" />
                      <span className="line-clamp-1">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{d.category}</td>
                  <td className="px-4 py-3 font-medium text-stone-800">{d.employeeName}</td>
                  <td className="px-4 py-3 text-stone-500">{d.uploadedDate}</td>
                  <td className="px-4 py-3 text-stone-500">{d.expiryDate || 'Permanent'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        d.status === 'valid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {d.status === 'valid' ? 'ACTIVE & VALID' : 'EXPIRING SOON'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => alert(`Downloading ${d.name}...`)}
                      className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-200"
                    >
                      <Download size={12} /> Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Upload Document */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold text-stone-900">Upload Workforce Document</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-stone-400 hover:text-stone-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpload} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-700">Document Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., NDA & Intellectual Property Assignment"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs focus:border-red-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-700 focus:border-red-700 focus:outline-hidden"
                >
                  <option value="Contract">Contracts & NDAs</option>
                  <option value="Tax & KRA">Tax & KRA Certificates</option>
                  <option value="Compliance">Compliance & ISO</option>
                  <option value="Health & Safety">Health & Safety Badges</option>
                </select>
              </div>

              <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500">
                <FileText size={24} className="mx-auto text-stone-400 mb-2" />
                <p className="font-semibold text-stone-700">Drag & drop your PDF file here, or browse</p>
                <p className="text-[10px] text-stone-400 mt-1">PDF, DOCX up to 25MB · Encrypted at rest</p>
              </div>

              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary text-xs font-semibold">
                  Confirm Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
