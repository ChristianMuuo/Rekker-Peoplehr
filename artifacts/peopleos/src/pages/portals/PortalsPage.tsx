import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, FileText, MessageSquarePlus, PackageCheck, Plus, ShieldCheck, ShoppingCart,
} from 'lucide-react';
import { apiGet, apiPost } from '../../lib/api';
import { PublicLayout, QuoteModal, useSeoMeta } from '../../components/PublicLayout';

/* ============================================================================
 * PHASE 4: ISOLATED CUSTOMER SELF-SERVICE PORTAL (/portal)
 * ==========================================================================*/
export function CustomerPortalPage() {
  useSeoMeta(
    'Customer Self-Service Portal | Rekker Limited',
    'Review your Rekker quotation requests, open support tickets, and commercial documents.',
    '/portal',
  );
  const qc = useQueryClient();
  const summary = useQuery({
    queryKey: ['customer-portal-summary'],
    queryFn: () => apiGet('/api/portal/customer/summary'),
  });

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Quotation & Pricing');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const quotes: any[] = summary.data?.quotations ?? [];
  const tickets: any[] = summary.data?.tickets ?? [];
  const docs: any[] = summary.data?.authorizedDocuments ?? [];

  const handleTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      await apiPost('/api/portal/customer/tickets', { subject, category, description });
      setSubject('');
      setDescription('');
      setMsg('Support ticket logged with your isolated customer account.');
      qc.invalidateQueries({ queryKey: ['customer-portal-summary'] });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <section className="bg-[#141312] py-12 text-white">
        <div className="mx-auto flex max-w-[1360px] flex-col justify-between gap-4 px-4 sm:flex-row sm:items-center md:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Customer Portal · Strict Account Isolation</p>
            <h1 className="mt-1 font-display text-3xl font-bold">My Quotations &amp; Support Desk</h1>
            <p className="mt-1 text-xs text-white/65">Account ID: <span className="font-mono text-white">{summary.data?.customerId ?? 'Authenticated Buyer'}</span></p>
          </div>
          <button onClick={() => setQuoteOpen(true)} className="btn btn-primary text-xs" data-testid="button-portal-new-quote">
            <Plus size={14} /> New Quotation Request
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-[1360px] space-y-6 px-4 py-10 md:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface p-5"><p className="text-[10px] font-bold uppercase text-stone-400">My Quotation Requests</p><p className="mt-1 font-display text-3xl font-bold text-stone-900">{quotes.length}</p></div>
          <div className="surface p-5"><p className="text-[10px] font-bold uppercase text-stone-400">Open Support Tickets</p><p className="mt-1 font-display text-3xl font-bold text-stone-900">{tickets.length}</p></div>
          <div className="surface p-5"><p className="text-[10px] font-bold uppercase text-stone-400">Authorized Documents</p><p className="mt-1 font-display text-3xl font-bold text-stone-900">{docs.length}</p></div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="surface p-6">
            <h2 className="font-display text-lg font-bold text-stone-900">Quotation History &amp; Review Status</h2>
            {!quotes.length ? (
              <p className="mt-4 rounded-xl border border-dashed border-stone-200 p-6 text-center text-xs text-stone-500">
                No quotations submitted yet for your account. Submit a request to track commercial pricing here.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {quotes.map((q) => (
                  <div key={q.id} className="rounded-xl border border-stone-200 p-4 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#C71D1D]">{q.referenceCode}</span>
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-stone-700">{q.status}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-stone-900">{q.productName}</p>
                    <p className="mt-0.5 text-stone-500">Quantity: {q.requestedQuantity} units · Delivery: {q.deliveryLocation}</p>
                    {q.quotedTotalKes != null && (
                      <p className="mt-2 font-bold text-emerald-700">Official Quoted Total: KES {Number(q.quotedTotalKes).toLocaleString()}</p>
                    )}
                    {q.reviewComment && <p className="mt-1 text-stone-600">Commercial Desk Note: {q.reviewComment}</p>}
                  </div>
                ))}
              </div>
            )}

            <h3 className="mt-8 font-display text-base font-bold text-stone-900">Authorized Documents</h3>
            <div className="mt-3 space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3 text-xs">
                  <div className="flex items-center gap-2.5"><FileText size={15} className="text-[#C71D1D]" /><span className="font-semibold text-stone-800">{d.name}</span></div>
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">{d.category}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="surface p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-stone-900"><MessageSquarePlus size={18} className="text-[#C71D1D]" /> Open Support Ticket</h2>
            <form onSubmit={handleTicket} className="mt-4 space-y-3">
              <label className="block text-xs"><span className="font-semibold text-stone-700">Subject *</span><input required value={subject} onChange={(e) => setSubject(e.target.value)} className="field mt-1" placeholder="e.g., Delivery timeline for Nakuru order" /></label>
              <label className="block text-xs"><span className="font-semibold text-stone-700">Category</span><select value={category} onChange={(e) => setCategory(e.target.value)} className="field mt-1"><option>Quotation &amp; Pricing</option><option>Delivery &amp; Logistics</option><option>Quality Inquiry</option><option>Account Profile</option></select></label>
              <label className="block text-xs"><span className="font-semibold text-stone-700">Details *</span><textarea required minLength={10} value={description} onChange={(e) => setDescription(e.target.value)} className="field mt-1 min-h-24" /></label>
              <button type="submit" disabled={submitting} className="btn btn-primary w-full text-xs">{submitting ? 'Submitting…' : 'Submit Ticket'}</button>
              {msg && <p className="text-xs font-semibold text-emerald-700">{msg}</p>}
            </form>

            {tickets.length > 0 && (
              <div className="mt-6 space-y-2 border-t border-stone-100 pt-4">
                <p className="text-[11px] font-bold uppercase text-stone-400">Your Support Requests</p>
                {tickets.map((t) => (
                  <div key={t.id} className="rounded-lg border border-stone-200 p-3 text-xs">
                    <div className="flex justify-between font-bold"><span>{t.ticketNumber}</span><span className="uppercase text-[#C71D1D]">{t.status}</span></div>
                    <p className="mt-1 font-semibold text-stone-800">{t.subject}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      {quoteOpen && <QuoteModal onClose={() => { setQuoteOpen(false); qc.invalidateQueries({ queryKey: ['customer-portal-summary'] }); }} />}
    </PublicLayout>
  );
}

/* ============================================================================
 * PHASE 5: DISTRIBUTOR & WHOLESALE PORTAL (/distributor)
 * ==========================================================================*/
export function DistributorPortalPage() {
  useSeoMeta(
    'Distributor & Wholesale Portal | Rekker Limited',
    'Authorized trade ordering portal with configurable MOQ validation, delivery scheduling, and order tracking.',
    '/distributor',
  );
  const qc = useQueryClient();
  const dash = useQuery({
    queryKey: ['distributor-dashboard'],
    queryFn: () => apiGet('/api/portal/distributor/dashboard'),
  });

  const [selectedProdId, setSelectedProdId] = useState('');
  const [qty, setQty] = useState('24');
  const [county, setCounty] = useState('Nairobi');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const catalog: any[] = dash.data?.catalog ?? [];
  const orders: any[] = dash.data?.orders ?? [];
  const activeProd = catalog.find((p) => p.id === selectedProdId) ?? catalog[0];

  const handleOrder = async (submitNow: boolean) => {
    if (!activeProd) return;
    setSubmitting(true);
    setError(null);
    setSuccessOrder(null);
    try {
      const created = await apiPost('/api/portal/distributor/orders', {
        deliveryCounty: county,
        deliveryNotes: notes,
        submitNow,
        items: [{ productId: activeProd.id, quantity: Number(qty) || 0 }],
      });
      setSuccessOrder(`${created.orderNumber} (${created.status}) · Total: KES ${Number(created.totalAmountKes || 0).toLocaleString()}`);
      qc.invalidateQueries({ queryKey: ['distributor-dashboard'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to place wholesale order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <section className="bg-[#141312] py-12 text-white">
        <div className="mx-auto flex max-w-[1360px] flex-col justify-between gap-4 px-4 sm:flex-row sm:items-center md:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">B2B Partner Portal · MOQ Enforced Server-Side</p>
            <h1 className="mt-1 font-display text-3xl font-bold">Wholesale Distributor Ordering</h1>
            <p className="mt-1 text-xs text-white/65">Tier: <span className="font-bold text-white">{dash.data?.tierName ?? 'Regional Trade Partner'}</span> · Account: <span className="font-mono">{dash.data?.distributorId ?? '—'}</span></p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs">
            <ShieldCheck size={16} className="text-emerald-400" /> Competing distributor orders strictly isolated
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1360px] gap-6 px-4 py-10 lg:grid-cols-[1fr_1.3fr] md:px-8">
        <div className="surface p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-stone-900">
            <ShoppingCart size={18} className="text-[#C71D1D]" /> Create Wholesale Order
          </h2>
          <p className="mt-1 text-xs text-stone-500">Totals are computed server-side from your approved trade tier pricing. Minimum Order Quantities (MOQ) are enforced on submission.</p>

          <div className="mt-5 space-y-4">
            <label className="block text-xs">
              <span className="font-semibold text-stone-700">Select Rekker Product Line *</span>
              <select
                value={activeProd?.id ?? ''}
                onChange={(e) => setSelectedProdId(e.target.value)}
                className="field mt-1"
                data-testid="select-wholesale-product"
              >
                {catalog.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brandName} · {p.name} (MOQ: {p.moqUnits} · KES {p.tradePriceKes ?? 0})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="font-semibold text-stone-700">Units (MOQ {activeProd?.moqUnits ?? 12}) *</span>
                <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="field mt-1" data-testid="input-wholesale-qty" />
              </label>
              <label className="block text-xs">
                <span className="font-semibold text-stone-700">Delivery County *</span>
                <input value={county} onChange={(e) => setCounty(e.target.value)} className="field mt-1" />
              </label>
            </div>

            <label className="block text-xs">
              <span className="font-semibold text-stone-700">Warehouse / Delivery Notes</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="field mt-1" placeholder="Receiving hours, offloading contact..." />
            </label>

            {error && <p className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-[#C71D1D]" data-testid="text-wholesale-error">{error}</p>}
            {successOrder && <p className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-700" data-testid="text-wholesale-success">{successOrder}</p>}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button type="button" disabled={submitting} onClick={() => handleOrder(false)} className="btn btn-secondary text-xs">
                Save Order Draft
              </button>
              <button type="button" disabled={submitting} onClick={() => handleOrder(true)} className="btn btn-primary text-xs" data-testid="button-submit-wholesale-order">
                Submit for Approval
              </button>
            </div>
          </div>
        </div>

        <div className="surface p-6">
          <h2 className="font-display text-lg font-bold text-stone-900">Your Wholesale Order History</h2>
          {!orders.length ? (
            <p className="mt-4 rounded-xl border border-dashed border-stone-200 p-8 text-center text-xs text-stone-500">
              No wholesale purchase orders recorded yet for this distributor account.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {orders.map((o) => (
                <div key={o.id} className="rounded-xl border border-stone-200 p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#C71D1D]">{o.orderNumber}</span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-stone-700">{o.status}</span>
                  </div>
                  <p className="mt-1.5 font-bold text-stone-900">{o.totalUnits} total units · KES {Number(o.totalAmountKes || 0).toLocaleString()}</p>
                  <p className="text-stone-500">Destination: {o.deliveryCounty}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
