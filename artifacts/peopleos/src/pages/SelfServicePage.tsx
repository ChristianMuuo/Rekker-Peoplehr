import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  User, FileText, Laptop, Receipt, CalendarDays, ShieldCheck, ArrowRight, Target
} from 'lucide-react';
import { Link } from 'wouter';
import { useGetAuthContext, useListLeaveBalances, useListLeaveRequests } from '@workspace/api-client-react';
import { apiGet } from '../lib/api';

export function SelfServicePage() {
  const auth = useGetAuthContext();
  const myEmpId = '10000000-0000-4000-8000-000000000007';

  const profileQuery = useQuery({
    queryKey: ['profile-360', myEmpId],
    queryFn: () => apiGet(`/api/employees/${myEmpId}/profile-360`),
  });
  const p9aQuery = useQuery({
    queryKey: ['p9a', myEmpId],
    queryFn: () => apiGet(`/api/payroll/p9a/${myEmpId}`),
  });
  const balances = useListLeaveBalances();
  const leaves = useListLeaveRequests();
  const expenses = useQuery({ queryKey: ['expenses'], queryFn: () => apiGet('/api/expenses') });
  const assets = useQuery({ queryKey: ['assets'], queryFn: () => apiGet('/api/assets') });

  const prof = profileQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Employee Self-Service Portal</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">
            My PeopleOS Workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Personal identity vault, statutory KRA P9A summary, assigned company equipment, leave balances, and expense status for {auth.data?.displayName || 'your account'}.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/leave" className="btn btn-secondary text-xs">Request Leave</Link>
          <Link href="/expenses" className="btn btn-primary text-xs">Submit Expense</Link>
        </div>
      </div>

      {/* Identity & Compliance Cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700"><User size={18} /></div>
            <div>
              <h2 className="font-display text-sm font-bold text-stone-900">{prof?.fullName || auth.data?.displayName}</h2>
              <p className="text-xs text-stone-500">{prof?.jobTitle || 'Rekker Team Member'}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-stone-100 pt-3 text-xs">
            <div className="flex justify-between"><span className="text-stone-500">Employee No</span><span className="font-mono font-semibold">{prof?.employeeNumber || 'REK'}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Location</span><span className="font-medium">{prof?.location || 'Nairobi'}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Next of Kin</span><span className="font-medium">{prof?.emergencyContact?.name || 'On file'} ({prof?.emergencyContact?.phone || 'Masked'})</span></div>
          </div>
        </div>

        <div className="surface p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><ShieldCheck size={18} /></div>
            <div>
              <h2 className="font-display text-sm font-bold text-stone-900">Kenya Statutory & ODPC Vault</h2>
              <p className="text-xs text-stone-500">Masked PII protected with AES-256-GCM</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-stone-100 pt-3 text-xs">
            <div className="flex justify-between"><span className="text-stone-500">KRA PIN</span><span className="font-mono font-bold">{prof?.statutoryIdentifiers?.kraPin || 'A00*****K'}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">National ID</span><span className="font-mono font-bold">{prof?.statutoryIdentifiers?.nationalId || '****'}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">NSSF / SHIF</span><span className="font-mono">{prof?.statutoryIdentifiers?.nssfNo || 'On file'} · {prof?.statutoryIdentifiers?.shaNo || 'Active'}</span></div>
          </div>
        </div>

        <div className="surface p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><FileText size={18} /></div>
            <div>
              <h2 className="font-display text-sm font-bold text-stone-900">YTD Tax & Compensation (P9A)</h2>
              <p className="text-xs text-stone-500">{p9aQuery.data?.statutoryConfigName || 'Active KRA Schedule'}</p>
            </div>
          </div>
          {p9aQuery.data?.totals ? (
            <div className="mt-4 space-y-2 border-t border-stone-100 pt-3 text-xs">
              <div className="flex justify-between"><span className="text-stone-500">YTD Gross Earnings</span><span className="font-bold">KES {p9aQuery.data.totals.grossPay.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">YTD PAYE Remitted</span><span className="font-bold text-red-700">KES {p9aQuery.data.totals.payeDeducted.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">YTD NSSF + SHIF</span><span className="font-semibold">KES {(p9aQuery.data.totals.nssf + p9aQuery.data.totals.shif).toLocaleString()}</span></div>
            </div>
          ) : (
            <div className="mt-4 text-xs text-stone-400">Loading statutory YTD card...</div>
          )}
        </div>
      </div>

      {/* Quick Operational Widgets */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-stone-900 flex items-center gap-2"><CalendarDays size={16} className="text-red-700" /> My Leave Balances</h3>
            <Link href="/leave" className="text-xs font-bold text-red-700">Open Leave</Link>
          </div>
          {!(balances.data?.length) ? (
            <p className="text-xs text-stone-500">No organization leave policies configured yet. Your recent requests: {(leaves.data ?? []).length}</p>
          ) : (
            <div className="space-y-2 text-xs">
              {balances.data.slice(0, 4).map((b, i) => (
                <div key={i} className="flex justify-between border-b border-stone-100 pb-1.5">
                  <span>{b.leaveTypeName}</span>
                  <span className="font-bold text-emerald-700">{b.remainingDays} days left</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-stone-900 flex items-center gap-2"><Laptop size={16} className="text-stone-700" /> Assigned Equipment</h3>
            <Link href="/assets" className="text-xs font-bold text-red-700">View Assets</Link>
          </div>
          <div className="space-y-2 text-xs">
            {(assets.data?.items ?? []).slice(0, 3).map((a: any) => (
              <div key={a.id} className="flex justify-between border-b border-stone-100 pb-1.5">
                <span className="truncate pr-2">{a.name}</span>
                <span className="font-mono text-[10px] text-stone-500">{a.assetTag}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-stone-900 flex items-center gap-2"><Receipt size={16} className="text-stone-700" /> Recent Expenses</h3>
            <Link href="/expenses" className="text-xs font-bold text-red-700">All Claims</Link>
          </div>
          <div className="space-y-2 text-xs">
            {(expenses.data?.items ?? []).slice(0, 3).map((e: any) => (
              <div key={e.id} className="flex justify-between border-b border-stone-100 pb-1.5">
                <span className="truncate pr-2">{e.title}</span>
                <span className="font-bold">KES {(e.amountKes || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
