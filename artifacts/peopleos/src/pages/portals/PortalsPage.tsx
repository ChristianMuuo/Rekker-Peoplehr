import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  ExternalLink, FileText, MessageSquarePlus, Plus, ShieldCheck, ShoppingBag, ShoppingCart, X,
} from 'lucide-react';
import { apiGet, apiPost } from '../../lib/api';

function B2BPortalTopbar({ active }: { active: 'customer' | 'distributor' }) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="https://rekker.co.ke/Logo.jpg" alt="Rekker" className="h-8 w-auto" />
            <span className="border-l border-stone-300 pl-3 font-display text-sm font-bold text-stone-800">B2B Portals</span>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <a href="https://rekker.co.ke/" target="_blank" rel="noreferrer" className="hidden items-center gap-1 text-stone-500 hover:text-stone-900 sm:inline-flex">
            rekker.co.ke <ExternalLink size={12} />
          </a>
          <a href="https://shop.rekker.co.ke/" target="_blank" rel="noreferrer" className="hidden items-center gap-1 text-stone-500 hover:text-stone-900 sm:inline-flex">
            <ShoppingBag size={12} /> shop.rekker.co.ke <ExternalLink size={12} />
          </a>
          <Link href="/portal" className={`rounded-lg px-3 py-1.5 ${active === 'customer' ? 'bg-[#f9e9e6] text-[#C71D1D]' : 'text-stone-600 hover:bg-stone-100'}`}>Customer Portal</Link>
          <Link href="/distributor" className={`rounded-lg px-3 py-1.5 ${active === 'distributor' ? 'bg-[#f9e9e6] text-[#C71D1D]' : 'text-stone-600 hover:bg-stone-100'}`}>Distributor Portal</Link>
          <Link href="/overview" className="btn btn-primary min-h-8 px-3 text-xs">Open PeopleOS ERP</Link>
        </div>
      </div>
    </header>
  );
}

/* ============================================================================
 * ISOLATED CUSTOMER SELF-SERVICE PORTAL (/portal)
 * ==========================================================================*/
export function CustomerPortalPage() {
  const qc = useQueryClient();
  const summary = useQuery({
    queryKey: ['customer-portal-summary'],
    queryFn: () => apiGet('/api/portal/customer/summary'),
  });

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [qName, setQName] = useState('');
  const [qCompany, setQCompany] = useState('');
  const [qEmail, setQEmail] = useState('');
  const [qProd, setQProd] = useState('Saffron Milan Hard-Water Laundry Carton');
  const [qQty, setQQty] = useState('24');
  const [qLoc, setQLoc] = useState('Nairobi');
  const [qNotes, setQNotes] = useState('');

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Quotation & Pricing');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const quotes: any[] = summary.data?.quotations ?? [];
  const tickets: any[] = summary.data?.tickets ?? [];
  const docs: any[] = summary.data?.authorizedDocuments ?? [];

  const handleQuoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost('/api/portal/customer/quotes', {
        customerName: qName,
        companyName: qCompany,
        email: qEmail,
        productName: qProd,
        requestedQuantity: Number(qQty) || 12,
        deliveryLocation: qLoc,
        requirements: qNotes,
      });
      setQuoteOpen(false);
      qc.invalidateQueries({ queryKey: ['customer-portal-summary'] });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      await apiPost('/api/portal/customer/tickets', { subject, category, description });
      setSubject('');
      setDescription('');
      setMsg('Support ticket logged under your account.');
      qc.invalidateQueries({ queryKey: ['customer-portal-summary'] });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f7f5f1] text-stone-900">
      <B2BPortalTopbar active="customer" />
      <section className="bg-[#141312] py-10 text-white">
        <div className="mx-auto flex max-w-[1360px] flex-col justify-between gap-4 px-4 sm:flex-row sm:items-center md:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Authenticated Buyer Desk · Strict Account Isolation</p>
            <h1 className="mt-1 font-display text-3xl font-bold">My B2B Quotations &amp; Support</h1>
            <p className="mt-1 text-xs text-white/65">For direct consumer retail checkout, use <a href="https://shop.rekker.co.ke" target="_blank" rel="noreferrer" className="font-bold text-white underline">shop.rekker.co.ke</a>. Account: <span className="font-mono text-white">{summary.data?.customerId ?? '—'}</span></p>
          </div>
          <button onClick={() => setQuoteOpen(true)} className="btn btn-primary text-xs" data-testid="button-portal-new-quote">
            <Plus size={14} /> Request B2B Quotation
          </button>
        </div>
      </section>

      <main className="mx-auto max-w-[1360px] space-y-6 px-4 py-8 md:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface p-5"><p className="text-[10px] font-bold uppercase text-stone-400">My Quotation Requests</p><p className="mt-1 font-display text-3xl font-bold text-stone-900">{quotes.length}</p></div>
          <div className="surface p-5"><p className="text-[10px] font-bold uppercase text-stone-400">Support Tickets</p><p className="mt-1 font-display text-3xl font-bold text-stone-900">{tickets.length}</p></div>
          <div className="surface p-5"><p className="text-[10px] font-bold uppercase text-stone-400">Authorized Documents</p><p className="mt-1 font-display text-3xl font-bold text-stone-900">{docs.length}</p></div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="surface p-6">
            <h2 className="font-display text-lg font-bold text-stone-900">Quotation History &amp; Review Status</h2>
            {!quotes.length ? (
              <p className="mt-4 rounded-xl border border-dashed border-stone-200 p-6 text-center text-xs text-stone-500">
                No B2B quotations submitted yet for your account. Submit a request to track commercial pricing here.
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
                    {q.quotedTotalKes != null && <p className="mt-2 font-bold text-emerald-700">Official Quoted Total: KES {Number(q.quotedTotalKes).toLocaleString()}</p>}
                  </div>
                ))}
              </div>
            )}

            <h3 className="mt-8 font-display text-base font-bold text-stone-900">Authorized Account Documents</h3>
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
              <label className="block text-xs"><span className="font-semibold text-stone-700">Subject *</span><input required value={subject} onChange={(e) => setSubject(e.target.value)} className="field mt-1" placeholder="Delivery status or pricing inquiry" /></label>
              <label className="block text-xs"><span className="font-semibold text-stone-700">Category</span><select value={category} onChange={(e) => setCategory(e.target.value)} className="field mt-1"><option>Quotation &amp; Pricing</option><option>Delivery &amp; Logistics</option><option>Quality Inquiry</option></select></label>
              <label className="block text-xs"><span className="font-semibold text-stone-700">Details *</span><textarea required minLength={10} value={description} onChange={(e) => setDescription(e.target.value)} className="field mt-1 min-h-24" /></label>
              <button type="submit" disabled={submitting} className="btn btn-primary w-full text-xs">{submitting ? 'Submitting…' : 'Submit Ticket'}</button>
              {msg && <p className="text-xs font-semibold text-emerald-700">{msg}</p>}
            </form>
          </div>
        </div>
      </main>

      {quoteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/55 p-4" onClick={() => setQuoteOpen(false)}>
          <form onSubmit={handleQuoteSubmit} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-100 pb-2"><h3 className="font-display text-lg font-bold">New B2B Quotation Request</h3><button type="button" onClick={() => setQuoteOpen(false)}><X size={18} /></button></div>
            <input required value={qName} onChange={(e) => setQName(e.target.value)} className="field" placeholder="Contact Full Name *" />
            <input value={qCompany} onChange={(e) => setQCompany(e.target.value)} className="field" placeholder="Company / Retailer" />
            <input required type="email" value={qEmail} onChange={(e) => setQEmail(e.target.value)} className="field" placeholder="Business Email *" />
            <input required value={qProd} onChange={(e) => setQProd(e.target.value)} className="field" placeholder="Product Line (as on shop.rekker.co.ke) *" />
            <div className="grid grid-cols-2 gap-3">
              <input required type="number" min={1} value={qQty} onChange={(e) => setQQty(e.target.value)} className="field" placeholder="Qty *" />
              <input required value={qLoc} onChange={(e) => setQLoc(e.target.value)} className="field" placeholder="County *" />
            </div>
            <textarea value={qNotes} onChange={(e) => setQNotes(e.target.value)} className="field min-h-16" placeholder="Delivery notes or packaging specs" />
            <button type="submit" disabled={submitting} className="btn btn-primary w-full text-xs">Submit Request to CRM</button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * DISTRIBUTOR & WHOLESALE PORTAL (/distributor)
 * ==========================================================================*/
export function DistributorPortalPage() {
  const qc = useQueryClient();
  const dash = useQuery({
    queryKey: ['distributor-dashboard'],
    queryFn: () => apiGet('/api/portal/distributor/dashboard'),
  });

  const [selectedSku, setSelectedSku] = useState('');
  const [qty, setQty] = useState('24');
  const [county, setCounty] = useState('Nairobi');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pricebook: any[] = dash.data?.pricebook ?? [];
  const orders: any[] = dash.data?.orders ?? [];
  const activeItem = pricebook.find((p) => p.sku === selectedSku) ?? pricebook[0];

  const handleOrder = async (submitNow: boolean) => {
    if (!activeItem) return;
    setSubmitting(true);
    setError(null);
    setSuccessOrder(null);
    try {
      const created = await apiPost('/api/portal/distributor/orders', {
        deliveryCounty: county,
        deliveryNotes: notes,
        submitNow,
        items: [{ sku: activeItem.sku, quantity: Number(qty) || 0 }],
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
    <div className="min-h-[100dvh] bg-[#f7f5f1] text-stone-900">
      <B2BPortalTopbar active="distributor" />
      <section className="bg-[#141312] py-10 text-white">
        <div className="mx-auto flex max-w-[1360px] flex-col justify-between gap-4 px-4 sm:flex-row sm:items-center md:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">B2B Partner Portal · MOQ &amp; Tier Enforced</p>
            <h1 className="mt-1 font-display text-3xl font-bold">Wholesale Distributor Ordering</h1>
            <p className="mt-1 text-xs text-white/65">Tier: <span className="font-bold text-white">{dash.data?.tierName ?? 'Regional Trade Partner'}</span> · Partner: <span className="font-mono">{dash.data?.distributorId ?? '—'}</span></p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs">
            <ShieldCheck size={16} className="text-emerald-400" /> Competing distributor orders isolated · For partner onboarding visit rekker.co.ke/partnerships
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-[1360px] gap-6 px-4 py-8 lg:grid-cols-[1fr_1.3fr] md:px-8">
        <div className="surface p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-stone-900">
            <ShoppingCart size={18} className="text-[#C71D1D]" /> Create Bulk Wholesale Order
          </h2>
          <p className="mt-1 text-xs text-stone-500">Server-side contract pricing &amp; MOQ checks apply to every submission.</p>

          <div className="mt-5 space-y-4">
            <label className="block text-xs">
              <span className="font-semibold text-stone-700">Trade Pricebook SKU *</span>
              <select
                value={activeItem?.sku ?? ''}
                onChange={(e) => setSelectedSku(e.target.value)}
                className="field mt-1"
                data-testid="select-wholesale-product"
              >
                {pricebook.map((p) => (
                  <option key={p.sku} value={p.sku}>
                    {p.sku} · {p.name} (MOQ: {p.moqUnits} · KES {p.wholesaleUnitKes})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="font-semibold text-stone-700">Units (MOQ {activeItem?.moqUnits ?? 12}) *</span>
                <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="field mt-1" data-testid="input-wholesale-qty" />
              </label>
              <label className="block text-xs">
                <span className="font-semibold text-stone-700">Delivery County *</span>
                <input value={county} onChange={(e) => setCounty(e.target.value)} className="field mt-1" />
              </label>
            </div>

            <label className="block text-xs">
              <span className="font-semibold text-stone-700">Warehouse / Delivery Notes</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="field mt-1" placeholder="Receiving dock contact..." />
            </label>

            {error && <p className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-[#C71D1D]" data-testid="text-wholesale-error">{error}</p>}
            {successOrder && <p className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-700" data-testid="text-wholesale-success">{successOrder}</p>}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button type="button" disabled={submitting} onClick={() => handleOrder(false)} className="btn btn-secondary text-xs">Save Draft</button>
              <button type="button" disabled={submitting} onClick={() => handleOrder(true)} className="btn btn-primary text-xs" data-testid="button-submit-wholesale-order">Submit Purchase Order</button>
            </div>
          </div>
        </div>

        <div className="surface p-6">
          <h2 className="font-display text-lg font-bold text-stone-900">Wholesale Purchase Orders</h2>
          {!orders.length ? (
            <p className="mt-4 rounded-xl border border-dashed border-stone-200 p-8 text-center text-xs text-stone-500">
              No wholesale orders recorded yet for this distributor account.
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
      </main>
    </div>
  );
}
