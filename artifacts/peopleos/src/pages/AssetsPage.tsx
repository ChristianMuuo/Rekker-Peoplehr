import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, Plus, RotateCcw, UserPlus, X } from 'lucide-react';
import { useGetAuthContext, useListEmployees } from '@workspace/api-client-react';
import { apiGet, apiPatch, apiPost } from '../lib/api';

export function AssetsPage() {
  const auth = useGetAuthContext();
  const employees = useListEmployees({ page: 1, pageSize: 50 });
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [assetTag, setAssetTag] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Laptop & Workstation');
  const [serialNumber, setSerialNumber] = useState('');
  const [valueKes, setValueKes] = useState('180000');
  const [assignedEmployeeId, setAssignedEmployeeId] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['assets'],
    queryFn: () => apiGet('/api/assets'),
  });

  const items: any[] = data?.items ?? [];
  const canManage = Boolean(auth.data?.canManagePeople);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/assets', {
      assetTag,
      name,
      category,
      serialNumber,
      valueKes: Number(valueKes),
      assignedEmployeeId: assignedEmployeeId || null,
    });
    setAssetTag('');
    setName('');
    setSerialNumber('');
    setAssignedEmployeeId('');
    setShowAdd(false);
    qc.invalidateQueries({ queryKey: ['assets'] });
  };

  const handleRecover = async (assetId: string) => {
    await apiPatch(`/api/assets/${assetId}/assign`, { action: 'return' });
    qc.invalidateQueries({ queryKey: ['assets'] });
  };

  const totalValue = items.reduce((s, a) => s + (a.valueKes || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">IT & Fleet Governance</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">Company Assets & Equipment</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Track assigned laptops, fleet vehicles, safety PPE kits, and offboarding asset return clearances.
          </p>
        </div>
        {canManage && (
          <button onClick={() => setShowAdd(true)} className="btn btn-primary text-xs">
            <Plus size={15} /> Register Asset
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Tracked Inventory</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">{items.length} Assets</p>
          <p className="mt-1 text-xs text-stone-500">{items.filter(a => a.status === 'assigned').length} currently assigned</p>
        </div>
        <div className="surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Total Insured Value</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">KES {totalValue.toLocaleString()}</p>
          <p className="mt-1 text-xs text-stone-500">Book & replacement valuation</p>
        </div>
        <div className="surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Ready Stock</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-700">{items.filter(a => a.status === 'available').length} Available</p>
          <p className="mt-1 text-xs text-stone-500">Cleared for new hire issuance</p>
        </div>
      </div>

      <div className="surface overflow-hidden">
        {isLoading ? (
          <div className="p-6"><div className="skeleton h-28" /></div>
        ) : isError ? (
          <div className="p-6 text-xs text-red-700">Failed to load assets. <button onClick={() => refetch()} className="underline">Retry</button></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-3">Asset Tag</th>
                  <th className="px-4 py-3">Equipment Name</th>
                  <th className="px-4 py-3">Serial No</th>
                  <th className="px-4 py-3">Assigned Holder</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3">Status</th>
                  {canManage && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.map((a) => (
                  <tr key={a.id} className="hover:bg-stone-50/70">
                    <td className="px-4 py-3 font-mono font-bold text-red-700">{a.assetTag}</td>
                    <td className="px-4 py-3 font-semibold text-stone-900">
                      {a.name}
                      <p className="text-[10px] font-normal text-stone-500">{a.category}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-stone-500">{a.serialNumber}</td>
                    <td className="px-4 py-3 text-stone-700">{a.assignedEmployeeName || 'Unassigned Vault'}</td>
                    <td className="px-4 py-3 text-right font-medium">KES {(a.valueKes || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.status === 'available' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                        {a.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {a.status === 'assigned' ? (
                          <button onClick={() => handleRecover(a.id)} className="inline-flex items-center gap-1 rounded bg-stone-100 px-2.5 py-1 text-[10px] font-bold text-stone-700 hover:bg-stone-200">
                            <RotateCcw size={11} /> Mark Returned
                          </button>
                        ) : (
                          <span className="text-[10px] text-stone-400">Ready</span>
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

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-display text-base font-bold text-stone-900">Register Company Asset</h3>
              <button onClick={() => setShowAdd(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleRegister} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Asset Tag</label>
                  <input required value={assetTag} onChange={e => setAssetTag(e.target.value)} className="field text-xs" placeholder="REK-IT-099" />
                </div>
                <div>
                  <label className="label">Serial Number</label>
                  <input required value={serialNumber} onChange={e => setSerialNumber(e.target.value)} className="field text-xs" placeholder="SN-881920" />
                </div>
              </div>
              <div>
                <label className="label">Asset Model / Name</label>
                <input required value={name} onChange={e => setName(e.target.value)} className="field text-xs" placeholder="Dell Latitude 7450" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="field text-xs">
                    <option>Laptop & Workstation</option>
                    <option>Fleet Vehicle</option>
                    <option>Safety PPE</option>
                    <option>Mobile & Radio</option>
                  </select>
                </div>
                <div>
                  <label className="label">Value (KES)</label>
                  <input type="number" value={valueKes} onChange={e => setValueKes(e.target.value)} className="field text-xs" />
                </div>
              </div>
              <div>
                <label className="label">Assign to Employee (Optional)</label>
                <select value={assignedEmployeeId} onChange={e => setAssignedEmployeeId(e.target.value)} className="field text-xs">
                  <option value="">Keep in Available Vault</option>
                  {(employees.data?.items ?? []).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary text-xs">Cancel</button>
                <button type="submit" className="btn btn-primary text-xs">Save Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
