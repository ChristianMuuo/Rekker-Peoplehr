import React, { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ArrowRight, Building2, CheckCircle2, Globe, Menu, PackageCheck, ShieldCheck,
  ShoppingBag, Sparkles, Truck, Users, X,
} from 'lucide-react';
import { apiPost } from '../lib/api';

export function useSeoMeta(title: string, description: string, path: string = '/') {
  useEffect(() => {
    document.title = title;
    const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', `https://rekker.co.ke${path}`);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `https://rekker.co.ke${path}`;
  }, [title, description, path]);
}

export const PUBLIC_NAV = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Brands', href: '/brands' },
  { label: 'Catalogue', href: '/products' },
  { label: 'Manufacturing', href: '/manufacturing' },
  { label: 'Distribution', href: '/distribution' },
  { label: 'Partnerships', href: '/partnerships' },
  { label: 'Careers', href: '/careers' },
  { label: 'Contact', href: '/contact' },
];

export function QuoteModal({
  initialProduct,
  onClose,
}: {
  initialProduct?: { id?: string; name?: string; moqUnits?: number } | null;
  onClose: () => void;
}) {
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [productName, setProductName] = useState(initialProduct?.name ?? 'Saffron Milan Hard-Water Laundry Detergent Line');
  const [quantity, setQuantity] = useState(String(initialProduct?.moqUnits ?? 12));
  const [packagingPreference, setPackagingPreference] = useState('Wholesale Carton');
  const [deliveryLocation, setDeliveryLocation] = useState('Nairobi');
  const [requirements, setRequirements] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ referenceCode: string; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiPost('/api/public/quotes', {
        customerName,
        companyName,
        email,
        phone,
        productId: initialProduct?.id ?? null,
        productName,
        requestedQuantity: Number(quantity) || 12,
        packagingPreference,
        deliveryLocation,
        requirements,
      });
      setConfirmation({ referenceCode: res.referenceCode, message: res.message });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit quotation request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Request trade quotation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-[#161413] px-6 py-4 text-white">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Trade Desk · CRM Pipeline</p>
            <h3 className="font-display text-lg font-bold">Request Trade Quotation</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[82vh] overflow-y-auto p-6">
          {confirmation ? (
            <div className="space-y-4 py-4 text-center" data-testid="quote-confirmation">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={24} />
              </div>
              <h4 className="font-display text-xl font-bold text-stone-900">Quotation Request Submitted</h4>
              <p className="text-sm text-stone-600">{confirmation.message}</p>
              <div className="inline-block rounded-lg border border-stone-200 bg-stone-50 px-4 py-2 font-mono text-sm font-bold text-[#C71D1D]">
                Reference: {confirmation.referenceCode}
              </div>
              <div className="pt-2">
                <button onClick={onClose} className="btn btn-primary">Done</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-3.5 sm:grid-cols-2" data-testid="form-public-quote">
              <label className="text-xs">
                <span className="font-semibold text-stone-700">Full Name *</span>
                <input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="field mt-1" placeholder="Jane Wanjiku" />
              </label>
              <label className="text-xs">
                <span className="font-semibold text-stone-700">Company / Shop Name</span>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="field mt-1" placeholder="Kawangware Supermart Ltd" />
              </label>
              <label className="text-xs">
                <span className="font-semibold text-stone-700">Business Email *</span>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1" placeholder="procurement@company.co.ke" />
              </label>
              <label className="text-xs">
                <span className="font-semibold text-stone-700">Phone Number</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="field mt-1" placeholder="+254 7XX XXX XXX" />
              </label>
              <label className="text-xs sm:col-span-2">
                <span className="font-semibold text-stone-700">Product / Line Item *</span>
                <input required value={productName} onChange={(e) => setProductName(e.target.value)} className="field mt-1" />
              </label>
              <label className="text-xs">
                <span className="font-semibold text-stone-700">Requested Quantity (Units) *</span>
                <input required type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="field mt-1" />
              </label>
              <label className="text-xs">
                <span className="font-semibold text-stone-700">Packaging Format</span>
                <select value={packagingPreference} onChange={(e) => setPackagingPreference(e.target.value)} className="field mt-1">
                  <option>Wholesale Carton</option>
                  <option>Retail Display Packs</option>
                  <option>Institutional Bulk Jerrycans</option>
                  <option>Private Label Custom Packaging</option>
                </select>
              </label>
              <label className="text-xs sm:col-span-2">
                <span className="font-semibold text-stone-700">Delivery County / Town *</span>
                <input required value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} className="field mt-1" placeholder="e.g., Mombasa, Kisumu, Nakuru, Nairobi" />
              </label>
              <label className="text-xs sm:col-span-2">
                <span className="font-semibold text-stone-700">Additional Specifications / Frequency</span>
                <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} className="field mt-1 min-h-20" placeholder="Monthly replenishment cadence, preferred payment channel, etc." />
              </label>
              {error && <p className="text-xs font-semibold text-[#C71D1D] sm:col-span-2">{error}</p>}
              <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary" data-testid="button-submit-quote">
                  {submitting ? 'Submitting…' : 'Submit Quote Request'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#faf8f5] text-stone-900">
      {/* Top ecosystem bar */}
      <div className="bg-[#141312] px-4 py-2 text-[11px] text-white/75 md:px-8">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-white">Rekker Limited · Nairobi, Kenya</span>
            <span className="hidden sm:inline text-white/40">|</span>
            <span className="hidden sm:inline">Manufacturing &amp; 47-County Distribution</span>
          </div>
          <div className="flex items-center gap-3 font-semibold">
            <a href="https://shop.rekker.co.ke" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">
              <ShoppingBag size={12} /> Shop Online
            </a>
            <Link href="/portal" className="hover:text-white" data-testid="link-top-customer-portal">Customer Portal</Link>
            <Link href="/distributor" className="hover:text-white" data-testid="link-top-distributor-portal">Distributor Portal</Link>
            <Link href="/overview" className="rounded bg-[#C71D1D] px-2.5 py-0.5 text-white hover:bg-[#a91919]" data-testid="link-top-erp-workspace">
              ERP &amp; PeopleOS
            </Link>
          </div>
        </div>
      </div>

      {/* Main sticky nav */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[70px] max-w-[1360px] items-center justify-between px-4 md:px-8">
          <Link href="/" className="flex items-center gap-3" data-testid="link-public-brand">
            <img src="https://rekker.co.ke/Logo.jpg" alt="Rekker" className="h-9 w-auto rounded-sm" />
            <div className="hidden border-l border-stone-200 pl-3 sm:block">
              <span className="block font-display text-sm font-bold tracking-tight text-stone-900">REKKER</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Kenya FMCG</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 xl:flex" aria-label="Main navigation">
            {PUBLIC_NAV.map((item) => {
              const active = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    active ? 'bg-[#f9e9e6] text-[#C71D1D]' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuoteOpen(true)}
              className="btn btn-primary min-h-9 px-3.5 text-xs"
              data-testid="button-header-quote"
            >
              Request Quote <ArrowRight size={14} />
            </button>
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="btn btn-ghost min-h-9 px-2 xl:hidden"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div className="border-t border-stone-200 bg-white px-4 py-4 xl:hidden">
            <nav className="grid gap-1">
              {PUBLIC_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${
                    location === item.href ? 'bg-[#f9e9e6] text-[#C71D1D]' : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-stone-100 pt-3">
                <Link href="/portal" className="btn btn-secondary justify-center text-xs">Customer Portal</Link>
                <Link href="/distributor" className="btn btn-secondary justify-center text-xs">Distributor Portal</Link>
                <Link href="/overview" className="btn btn-primary col-span-2 justify-center text-xs">Open PeopleOS &amp; ERP</Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-stone-200 bg-[#141312] text-white/75">
        <div className="mx-auto grid max-w-[1360px] gap-10 px-4 py-14 md:grid-cols-4 md:px-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img src="https://rekker.co.ke/Logo.jpg" alt="Rekker Limited" className="h-9 w-auto rounded bg-white p-0.5" />
              <span className="font-display text-lg font-bold text-white">REKKER</span>
            </div>
            <p className="text-xs leading-6 text-white/60">
              Manufacturing, brand building and nationwide distribution across Kenya — Saffron Milan, Bio Saff, Cornells and PetCare.
            </p>
            <a
              href="https://shop.rekker.co.ke"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              <ShoppingBag size={14} className="text-[#e87c76]" /> Shop consumer brands on shop.rekker.co.ke
            </a>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Corporate</h4>
            <ul className="mt-4 space-y-2.5 text-xs">
              <li><Link href="/about" className="hover:text-white">About Rekker</Link></li>
              <li><Link href="/manufacturing" className="hover:text-white">Manufacturing &amp; R&amp;D</Link></li>
              <li><Link href="/distribution" className="hover:text-white">47-County Distribution</Link></li>
              <li><Link href="/partnerships" className="hover:text-white">Distributor &amp; Stockist Applications</Link></li>
              <li><Link href="/careers" className="hover:text-white">Careers (Live Openings)</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Portals &amp; Brands</h4>
            <ul className="mt-4 space-y-2.5 text-xs">
              <li><Link href="/brands/saffron-milan" className="hover:text-white">Saffron Milan · Home Care</Link></li>
              <li><Link href="/brands/bio-saff" className="hover:text-white">Bio Saff · Beauty &amp; Hair Care</Link></li>
              <li><Link href="/brands/cornells" className="hover:text-white">Cornells · Fragrance Distribution</Link></li>
              <li><Link href="/brands/petcare" className="hover:text-white">PetCare · Coat Care</Link></li>
              <li><Link href="/portal" className="font-semibold text-white hover:underline">Customer Portal</Link> · <Link href="/distributor" className="font-semibold text-white hover:underline">Distributor Portal</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Commercial Office</h4>
            <ul className="mt-4 space-y-2.5 text-xs">
              <li>Head Office: Nairobi, Kenya</li>
              <li>Email: <a href="mailto:info@rekker.co.ke" className="text-white hover:underline">info@rekker.co.ke</a></li>
              <li>Consumer Store: <a href="https://shop.rekker.co.ke" target="_blank" rel="noreferrer" className="text-white hover:underline">shop.rekker.co.ke</a></li>
              <li className="pt-2"><Link href="/contact" className="btn btn-primary min-h-9 px-4 text-xs">Contact Trade Team</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 px-4 py-5 text-xs text-white/50 md:px-8">
          <div className="mx-auto flex max-w-[1360px] flex-col items-center justify-between gap-3 sm:flex-row">
            <span>&copy; {new Date().getFullYear()} Rekker Limited. All rights reserved.</span>
            <div className="flex items-center gap-5">
              <Link href="/privacy" className="hover:text-white">ODPC Privacy Policy</Link>
              <Link href="/terms" className="hover:text-white">Terms of Service</Link>
              <Link href="/overview" className="hover:text-white">Employee ERP Login</Link>
            </div>
          </div>
        </div>
      </footer>

      {quoteOpen && <QuoteModal onClose={() => setQuoteOpen(false)} />}
    </div>
  );
}
