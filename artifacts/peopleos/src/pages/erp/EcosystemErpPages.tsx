import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

/* ============================================================================
 * CRM & SALES PIPELINE KANBAN (/crm)
 * ==========================================================================*/
const STAGE_LABELS: Record<string, string> = {
  new_lead: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  quotation_requested: 'Quote Requested',
  quotation_sent: 'Quote Sent',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

export function CrmPipelinePage() {
  const qc = useQueryClient();
  const leadsQuery = useQuery({ queryKey: ['erp-crm-leads'], queryFn: () => apiGet('/api/erp/crm/leads') });
  const analyticsQuery = useQuery({ queryKey: ['erp-crm-analytics'], queryFn: () => apiGet('/api/erp/crm/analytics') });
  const quotesQuery = useQuery({ queryKey: ['erp-quotations'], queryFn: () => apiGet('/api/erp/quotations') });

  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [interest, setInterest] = useState('Saffron Milan Wholesale');
  const [valueKes, setValueKes] = useState('150000');

  const leads: any[] = leadsQuery.data?.items ?? [];
  const stages: string[] = leadsQuery.data?.stages ?? Object.keys(STAGE_LABELS);
  const quotes: any[] = quotesQuery.data?.items ?? [];
  const analytics = analyticsQuery.data;

  const moveStage = async (id: string, stage: string) => {
    await apiPatch(`/api/erp/crm/leads/${id}/stage`, { stage });
    qc.invalidateQueries({ queryKey: ['erp-crm-leads'] });
    qc.invalidateQueries({ queryKey: ['erp-crm-analytics'] });
  };

  const approveQuote = async (qId: string, totalKes: number) => {
    await apiPatch(`/api/erp/quotations/${qId}`, {
      status: 'approved_quoted',
      quotedTotalKes: totalKes,
      reviewComment: 'Approved trade schedule applied.',
    });
    qc.invalidateQueries({ queryKey: ['erp-quotations'] });
  };

  const createLead = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiPost('/api/erp/crm/leads', {
      customerName: name,
      companyName: company,
      email,
      interestCategory: interest,
      estimatedValueKes: Number(valueKes) || 0,
    });
    setNewOpen(false);
    setName('');
    setCompany('');
    setEmail('');
    qc.invalidateQueries({ queryKey: ['erp-crm-leads'] });
    qc.invalidateQueries({ queryKey: ['erp-crm-analytics'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#C71D1D]">Commercial ERP / Sales Pipeline</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-stone-900">CRM &amp; B2B Quotation Desk</h1>
          <p className="mt-1 text-xs text-stone-500">Manage B2B quotations, inbound commercial leads from rekker.co.ke / shop.rekker.co.ke, and conversion stages.</p>
        </div>
        <button onClick={() => setNewOpen(true)} className="btn btn-primary text-xs"><Plus size={15} /> Add Manual Lead</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4"><p className="text-[10px] font-bold uppercase text-stone-400">Stored CRM Leads</p><p className="mt-1 font-display text-2xl font-bold text-stone-900">{analytics?.totalLeads ?? 0}</p></div>
        <div className="surface p-4"><p className="text-[10px] font-bold uppercase text-stone-400">Open Opportunities</p><p className="mt-1 font-display text-2xl font-bold text-stone-900">{analytics?.openOpportunities ?? 0}</p></div>
        <div className="surface p-4"><p className="text-[10px] font-bold uppercase text-stone-400">Conversion Rate</p><p className="mt-1 font-display text-2xl font-bold text-emerald-700">{analytics?.conversionRatePct ?? 0}%</p></div>
        <div className="surface p-4"><p className="text-[10px] font-bold uppercase text-stone-400">Won Deal Value</p><p className="mt-1 font-display text-2xl font-bold text-stone-900">KES {(analytics?.wonValueKes ?? 0).toLocaleString()}</p></div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[980px] gap-3">
          {stages.map((st) => {
            const col = leads.filter((l) => l.stage === st);
            return (
              <div key={st} className="w-60 shrink-0 rounded-2xl border border-stone-200 bg-stone-50/70 p-3">
                <div className="flex items-center justify-between px-1 pb-2">
                  <span className="text-xs font-bold text-stone-800">{STAGE_LABELS[st] ?? st}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-stone-500 ring-1 ring-stone-200">{col.length}</span>
                </div>
                <div className="space-y-2.5">
                  {col.map((lead) => (
                    <div key={lead.id} className="rounded-xl border border-stone-200 bg-white p-3 text-xs shadow-2xs">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#C71D1D]">
                        <span>{lead.referenceCode}</span>
                        <span className="uppercase text-stone-400">{lead.source.replaceAll('_', ' ')}</span>
                      </div>
                      <p className="mt-1 font-bold text-stone-900">{lead.companyName || lead.customerName}</p>
                      <p className="text-[11px] text-stone-500">{lead.interestCategory}</p>
                      <select
                        value={lead.stage}
                        onChange={(e) => moveStage(lead.id, e.target.value)}
                        aria-label={`Change stage for ${lead.referenceCode}`}
                        className="mt-2 w-full rounded border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-700"
                      >
                        {stages.map((opt) => (
                          <option key={opt} value={opt}>{STAGE_LABELS[opt] ?? opt}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {col.length === 0 && <p className="py-4 text-center text-[11px] text-stone-400">No leads</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="surface p-5">
        <h2 className="font-display text-lg font-bold text-stone-900">B2B Quotation Review Queue ({quotes.length})</h2>
        {!quotes.length ? (
          <p className="mt-3 text-xs text-stone-500">Quotation requests submitted inside the Customer Portal enter this queue for official pricing &amp; approval.</p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {quotes.map((q) => (
              <div key={q.id} className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 p-4 text-xs sm:flex-row sm:items-center">
                <div>
                  <span className="font-mono font-bold text-[#C71D1D]">{q.referenceCode}</span> · <strong>{q.companyName || q.customerName}</strong>
                  <p className="mt-0.5 text-stone-600">{q.productName} · {q.requestedQuantity} units to {q.deliveryLocation}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-bold uppercase text-stone-600">{q.status}</span>
                  {q.status === 'submitted' && (
                    <button onClick={() => approveQuote(q.id, q.requestedQuantity * 450)} className="btn btn-primary min-h-8 px-3 text-xs">
                      <Check size={13} /> Issue Trade Quote
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4" onClick={() => setNewOpen(false)}>
          <form onSubmit={createLead} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between"><h3 className="font-display text-lg font-bold">Add CRM Lead</h3><button type="button" onClick={() => setNewOpen(false)}><X size={18} /></button></div>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="Contact Full Name *" />
            <input value={company} onChange={(e) => setCompany(e.target.value)} className="field" placeholder="Company / Retailer" />
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" placeholder="Email *" />
            <input value={interest} onChange={(e) => setInterest(e.target.value)} className="field" placeholder="Interest Category" />
            <input type="number" value={valueKes} onChange={(e) => setValueKes(e.target.value)} className="field" placeholder="Estimated KES Value" />
            <button type="submit" className="btn btn-primary w-full text-xs">Save Lead</button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * DISTRIBUTOR APPLICATION APPROVALS (/partner-approvals)
 * ==========================================================================*/
export function PartnerApprovalsPage() {
  const qc = useQueryClient();
  const appsQuery = useQuery({ queryKey: ['erp-dist-apps'], queryFn: () => apiGet('/api/erp/distributors/applications') });
  const apps: any[] = appsQuery.data?.items ?? [];

  const decideApp = async (id: string, status: string) => {
    await apiPatch(`/api/erp/distributors/applications/${id}`, {
      status,
      reviewerNotes: `Commercial status updated to ${status}.`,
    });
    qc.invalidateQueries({ queryKey: ['erp-dist-apps'] });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#C71D1D]">Commercial ERP / Partner Governance</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-stone-900">Distributor Onboarding &amp; Approvals</h1>
        <p className="mt-1 text-xs text-stone-500">Review trade partner registrations and manage regional territory status inside ERP governance.</p>
      </div>

      {!apps.length ? (
        <div className="surface p-10 text-center text-xs text-stone-500">
          No pending distributor applications logged yet. Trade intake from <span className="font-bold">rekker.co.ke/partnerships</span> flows here when integrated.
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <div key={a.id} className="surface flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#C71D1D]">{a.referenceCode}</span>
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-bold uppercase">{a.status}</span>
                </div>
                <p className="text-sm font-bold text-stone-900">{a.businessName} · <span className="text-stone-600">{a.contactName}</span></p>
                <p className="text-stone-500">Type: {a.businessType} · Territory: {a.distributionArea} · {a.email} · {a.phone}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => decideApp(a.id, 'under_review')} className="btn btn-secondary min-h-8 px-3 text-xs">Under Review</button>
                <button onClick={() => decideApp(a.id, 'info_requested')} className="btn btn-secondary min-h-8 px-3 text-xs">Request Info</button>
                <button onClick={() => decideApp(a.id, 'approved')} className="btn btn-primary min-h-8 px-3 text-xs">Approve Partner</button>
                <button onClick={() => decideApp(a.id, 'rejected')} className="btn btn-ghost min-h-8 px-3 text-xs text-[#C71D1D]">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
