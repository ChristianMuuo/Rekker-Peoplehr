import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, Check, X, Wallet, Clock3, ShieldCheck } from 'lucide-react';
import { useGetAuthContext } from '@workspace/api-client-react';
import { apiGet, apiPost } from '../lib/api';

export function ExpensesPage() {
  const auth = useGetAuthContext();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Travel & Fleet');
  const [amountKes, setAmountKes] = useState('4500');
  const [receiptRef, setReceiptRef] = useState('');
  const [notes, setNotes] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => apiGet('/api/expenses'),
  });

  const items: any[] = data?.items ?? [];
  const canApprove = Boolean(auth.data?.canApproveLeave || auth.data?.canViewPayroll);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/expenses', {
      title,
      category,
      amountKes: Number(amountKes),
      receiptReference: receiptRef || null,
      notes: notes || null,
    });
    setTitle('');
    setAmountKes('4500');
    setReceiptRef('');
    setNotes('');
    setShowModal(false);
    qc.invalidateQueries({ queryKey: ['expenses'] });
  };

  const handleDecision = async (id: string, decision: 'approve' | 'reject' | 'reimburse') => {
    await apiPost(`/api/expenses/${id}/decision`, { decision });
    qc.invalidateQueries({ queryKey: ['expenses'] });
  };

  const totalPending = items.filter(i => i.status === 'pending').reduce((s, i) => s + (i.amountKes || 0), 0);
  const totalApproved = items.filter(i => i.status === 'approved' || i.status === 'reimbursed').reduce((s, i) => s + (i.amountKes || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Finance & Reimbursements</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">Expense Management</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Submit field travel, fleet fuel, and operational claims with KRA ETR receipt references and manager signoff.
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary text-xs">
          <Plus size={15} /> Submit Expense Claim
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Pending Review</p>
          <p className="mt-2 font-display text-2xl font-bold text-amber-700">KES {totalPending.toLocaleString()}</p>
          <p className="mt-1 text-xs text-stone-500">{items.filter(i => i.status === 'pending').length} open claims</p>
        </div>
        <div className="surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Approved & Reimbursed</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-700">KES {totalApproved.toLocaleString()}</p>
          <p className="mt-1 text-xs text-stone-500">Ready for M-Pesa / EFT payout</p>
        </div>
        <div className="surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Governance Policy</p>
          <p className="mt-2 flex items-center gap-2 font-display text-base font-bold text-stone-900">
            <ShieldCheck size={17} className="text-emerald-700" /> ETR Verified Claims
          </p>
          <p className="mt-1 text-xs text-stone-500">All payouts audited in trail</p>
        </div>
      </div>

      <div className="surface overflow-hidden">
        {isLoading ? (
          <div className="p-6"><div className="skeleton h-28" /></div>
        ) : isError ? (
          <div className="p-6 text-xs text-red-700">Failed to load expenses. <button onClick={() => refetch()} className="underline">Retry</button></div>
        ) : !items.length ? (
          <div className="p-10 text-center text-xs text-stone-500">No expense claims recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-3">Claim Title</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Receipt Ref</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  {canApprove && <th className="px-4 py-3 text-right">Decision</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50/70">
                    <td className="px-4 py-3 font-semibold text-stone-900">
                      {item.title}
                      {item.notes && <p className="text-[10px] font-normal text-stone-500">{item.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-stone-700">{item.employeeName || 'Teammate'}</td>
                    <td className="px-4 py-3 text-stone-600">{item.category}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-stone-500">{item.receiptReference || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-stone-900">KES {(item.amountKes || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${item.status === 'pending' ? 'bg-amber-100 text-amber-800' : item.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {item.status}
                      </span>
                    </td>
                    {canApprove && (
                      <td className="px-4 py-3 text-right">
                        {item.status === 'pending' ? (
                          <div className="inline-flex gap-1.5">
                            <button onClick={() => handleDecision(item.id, 'approve')} className="rounded bg-emerald-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-800">Approve</button>
                            <button onClick={() => handleDecision(item.id, 'reject')} className="rounded bg-stone-200 px-2 py-1 text-[10px] font-bold text-stone-700 hover:bg-stone-300">Decline</button>
                          </div>
                        ) : item.status === 'approved' ? (
                          <button onClick={() => handleDecision(item.id, 'reimburse')} className="rounded bg-red-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-800">Mark Paid</button>
                        ) : (
                          <span className="text-[10px] text-stone-400">Closed</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold text-stone-900">New Expense Claim</h3>
              <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <div>
                <label className="label">Claim Title</label>
                <input required value={title} onChange={e => setTitle(e.target.value)} className="field text-xs" placeholder="e.g., Mombasa Route Cold-Chain Fuel" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="field text-xs">
                    <option>Travel & Fleet</option>
                    <option>Commercial Marketing</option>
                    <option>Plant Equipment</option>
                    <option>Meals & Accommodation</option>
                  </select>
                </div>
                <div>
                  <label className="label">Amount (KES)</label>
                  <input type="number" min="1" required value={amountKes} onChange={e => setAmountKes(e.target.value)} className="field text-xs" />
                </div>
              </div>
              <div>
                <label className="label">KRA ETR / Receipt Reference</label>
                <input value={receiptRef} onChange={e => setReceiptRef(e.target.value)} className="field text-xs" placeholder="e.g., KRA-ETR-442190" />
              </div>
              <div>
                <label className="label">Business Justification</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="field min-h-20 text-xs" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary text-xs">Cancel</button>
                <button type="submit" className="btn btn-primary text-xs">Submit Claim</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

