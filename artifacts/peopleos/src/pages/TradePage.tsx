import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Box,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  X,
  Zap,
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';

export function TradePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    'overview' | 'catalog' | 'bulk_order' | 'orders' | 'quotations' | 'businesses' | 'copilot'
  >('overview');

  // Brand filter
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Cart state for Bulk Order
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('biz-001');
  const [poReference, setPoReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  // Modals
  const [showRegisterBizModal, setShowRegisterBizModal] = useState(false);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [showMpesaModal, setShowMpesaModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState('+254712345678');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Business Form State
  const [newBizLegalName, setNewBizLegalName] = useState('');
  const [newBizTradingName, setNewBizTradingName] = useState('');
  const [newBizType, setNewBizType] = useState<'retailer' | 'wholesaler' | 'distributor'>('distributor');
  const [newBizRegNo, setNewBizRegNo] = useState('');
  const [newBizKraPin, setNewBizKraPin] = useState('');
  const [newBizContact, setNewBizContact] = useState('');
  const [newBizEmail, setNewBizEmail] = useState('');
  const [newBizPhone, setNewBizPhone] = useState('');
  const [newBizLocation, setNewBizLocation] = useState('');
  const [newBizCreditTerms, setNewBizCreditTerms] = useState('net_30');

  // Trade AI Copilot State
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotMessages, setCopilotMessages] = useState<
    Array<{ sender: 'user' | 'agent'; text: string; structured?: any }>
  >([
    {
      sender: 'agent',
      text: 'Habari! I am your Rekker Trade B2B Copilot. You can ask me to assemble bulk carton orders (e.g., "I need 40 cartons of Saffron lotion and 20 cartons of Cornells beard oil"), analyze warehouse stock, or prepare custom wholesale quotation proposals.',
    },
  ]);
  const [isCopilotThinking, setIsCopilotThinking] = useState(false);

  // Queries
  const overviewQuery = useQuery({
    queryKey: ['trade-overview'],
    queryFn: () => apiGet<any>('/api/trade/overview'),
  });

  const productsQuery = useQuery({
    queryKey: ['trade-products', brandFilter],
    queryFn: () =>
      apiGet<any>(
        brandFilter === 'all'
          ? '/api/trade/products'
          : `/api/trade/products?brand=${encodeURIComponent(brandFilter)}`,
      ),
  });

  const businessesQuery = useQuery({
    queryKey: ['trade-businesses'],
    queryFn: () => apiGet<any>('/api/trade/businesses'),
  });

  const ordersQuery = useQuery({
    queryKey: ['trade-orders'],
    queryFn: () => apiGet<any>('/api/trade/orders'),
  });

  const quotationsQuery = useQuery({
    queryKey: ['trade-quotations'],
    queryFn: () => apiGet<any>('/api/trade/quotations'),
  });

  const invoicesQuery = useQuery({
    queryKey: ['trade-invoices'],
    queryFn: () => apiGet<any>('/api/trade/invoices'),
  });

  // Calculate live pricing for items in Cart
  const cartItemsArray = Object.entries(cart)
    .filter(([_, qty]) => qty > 0)
    .map(([productId, quantityCartons]) => ({ productId, quantityCartons }));

  const pricingQuery = useQuery({
    queryKey: ['trade-pricing-preview', selectedBusinessId, cartItemsArray],
    queryFn: () =>
      apiPost<any>('/api/trade/pricing/calculate', {
        businessId: selectedBusinessId,
        items: cartItemsArray,
      }),
    enabled: cartItemsArray.length > 0,
  });

  // Helper formatting
  const formatKes = (cents: number) => {
    return `KES ${Math.round(cents / 100).toLocaleString('en-KE')}`;
  };

  const handleAddToCart = (productId: string, quantityToAdd: number = 10) => {
    setCart((prev) => ({
      ...prev,
      [productId]: (prev[productId] || 0) + quantityToAdd,
    }));
    setBanner({
      type: 'success',
      message: `Added ${quantityToAdd} cartons to order draft. Total cartons: ${(cart[productId] || 0) + quantityToAdd}.`,
    });
  };

  const handleUpdateCartQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      const next = { ...cart };
      delete next[productId];
      setCart(next);
    } else {
      setCart((prev) => ({ ...prev, [productId]: qty }));
    }
  };

  const handleClearCart = () => {
    setCart({});
  };

  // Submit Order
  const handlePlaceOrder = async () => {
    if (cartItemsArray.length === 0) {
      setBanner({ type: 'error', message: 'Cart is empty. Please add products.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await apiPost<any>('/api/trade/orders', {
        businessId: selectedBusinessId,
        poReference: poReference.trim() || undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
        items: cartItemsArray,
      });

      setBanner({
        type: 'success',
        message: `Order ${res.order?.orderNumber} confirmed! Tax invoice ${res.invoice?.invoiceNumber} generated with eTIMS code ${res.invoice?.etimsControlCode}.`,
      });
      setCart({});
      setPoReference('');
      qc.invalidateQueries({ queryKey: ['trade-orders'] });
      qc.invalidateQueries({ queryKey: ['trade-invoices'] });
      qc.invalidateQueries({ queryKey: ['trade-overview'] });
      setActiveTab('orders');
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Failed to submit B2B order.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Business Registration
  const handleRegisterBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const res = await apiPost<any>('/api/trade/businesses', {
        legalName: newBizLegalName,
        tradingName: newBizTradingName || newBizLegalName,
        businessType: newBizType,
        registrationNumber: newBizRegNo,
        kraPin: newBizKraPin,
        primaryContactName: newBizContact,
        primaryEmail: newBizEmail,
        primaryPhone: newBizPhone,
        physicalLocation: newBizLocation,
        creditTerms: newBizCreditTerms,
      });

      setBanner({
        type: 'success',
        message: `Business ${res.business?.legalName} registered successfully! Status: ${res.business?.status}.`,
      });
      setShowRegisterBizModal(false);
      qc.invalidateQueries({ queryKey: ['trade-businesses'] });
      qc.invalidateQueries({ queryKey: ['trade-overview'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Registration failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verify / Approve Business
  const handleVerifyBusiness = async (bizId: string, approved: boolean) => {
    try {
      await apiPost(`/api/trade/businesses/${bizId}/verify`, {
        approved,
        creditLimitCents: approved ? 200000000 : 0, // KES 2M credit line
        tierDiscountPct: approved ? 12 : 0,
        notes: approved ? 'KRA PIN verified via iTax portal. Facility approved.' : 'Rejected compliance.',
      });
      setBanner({
        type: 'success',
        message: `Business ${bizId} ${approved ? 'approved' : 'rejected'} successfully.`,
      });
      qc.invalidateQueries({ queryKey: ['trade-businesses'] });
      qc.invalidateQueries({ queryKey: ['trade-overview'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Verification update failed.' });
    }
  };

  // M-Pesa Payment STK Push
  const handleTriggerMpesa = async () => {
    if (!selectedInvoice) return;
    try {
      setIsSubmitting(true);
      const res = await apiPost<any>('/api/trade/payments/mpesa', {
        invoiceId: selectedInvoice.id,
        phoneNumber: mpesaPhone,
        amountCents: selectedInvoice.balanceDueCents,
      });

      setBanner({
        type: 'success',
        message: `M-Pesa payment simulated successfully! Receipt: ${res.receiptNumber}. Invoice marked ${res.invoiceStatus}.`,
      });
      setShowMpesaModal(false);
      qc.invalidateQueries({ queryKey: ['trade-invoices'] });
      qc.invalidateQueries({ queryKey: ['trade-orders'] });
      qc.invalidateQueries({ queryKey: ['trade-overview'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'M-Pesa reconciliation failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copilot Chat
  const handleSendCopilot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotInput.trim()) return;

    const userText = copilotInput.trim();
    setCopilotMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setCopilotInput('');
    setIsCopilotThinking(true);

    try {
      const res = await apiPost<any>('/api/trade/ai/query', {
        prompt: userText,
        businessId: selectedBusinessId,
      });

      let replyText = res.summary || 'Processing complete.';
      setCopilotMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: replyText,
          structured: res,
        },
      ]);

      // If actionable draft order, prompt to populate cart
      if (res.actionable && res.draftOrder?.items?.length) {
        setBanner({
          type: 'success',
          message: `AI generated draft order with ${res.draftOrder.items.length} lines. You can apply this directly to your cart!`,
        });
      }
    } catch (err: any) {
      setCopilotMessages((prev) => [
        ...prev,
        { sender: 'agent', text: `Apologies, an error occurred: ${err.message}` },
      ]);
    } finally {
      setIsCopilotThinking(false);
    }
  };

  const applyAiDraftToCart = (draftItems: any[]) => {
    const nextCart: Record<string, number> = {};
    for (const item of draftItems) {
      if (item.productId && item.quantityCartons) {
        nextCart[item.productId] = item.quantityCartons;
      }
    }
    setCart(nextCart);
    setActiveTab('bulk_order');
    setBanner({
      type: 'success',
      message: 'Draft order from AI Copilot loaded into your bulk purchasing cart!',
    });
  };

  const overview = overviewQuery.data?.metrics;
  const brands = overviewQuery.data?.brands || [];
  const products = productsQuery.data?.products || [];
  const businesses = businessesQuery.data?.items || [];
  const orders = ordersQuery.data?.items || [];
  const quotations = quotationsQuery.data?.items || [];
  const invoices = invoicesQuery.data?.items || [];
  const pricingPreview = pricingQuery.data;

  return (
    <div className="space-y-6 pb-16">
      {/* Banner Notifications */}
      {banner && (
        <div
          className={`flex items-center justify-between rounded-xl p-4 shadow-sm transition-all ${
            banner.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
              : banner.type === 'error'
              ? 'border border-red-200 bg-red-50 text-red-900'
              : 'border border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-3">
            {banner.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            {banner.type === 'error' && <AlertCircle className="h-5 w-5 text-red-600" />}
            {banner.type === 'warning' && <AlertTriangle className="h-5 w-5 text-amber-600" />}
            <span className="text-sm font-medium">{banner.message}</span>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="text-stone-400 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-[#C71D1D]">
              B2B Enterprise Portal
            </span>
            <span className="text-xs font-semibold text-stone-500">trade.rekker.co.ke</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Rekker Trade Platform
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Wholesale distribution, carton bulk purchasing, and AI demand forecasting for Kenya’s premier FMCG brands.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('copilot')}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50 px-3.5 py-2 text-xs font-semibold text-[#C71D1D] shadow-sm hover:from-red-100 hover:to-orange-100"
          >
            <Sparkles className="h-4 w-4" />
            Trade AI Copilot
          </button>

          <button
            onClick={() => setShowRegisterBizModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-stone-800"
          >
            <Building2 className="h-4 w-4" />
            Register Business
          </button>

          <button
            onClick={() => setActiveTab('bulk_order')}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C71D1D] px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-red-800"
          >
            <ShoppingCart className="h-4 w-4" />
            Cart ({Object.values(cart).reduce((a, b) => a + b, 0)} Cartons)
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-stone-200">
        <nav className="-mb-px flex space-x-6 overflow-x-auto text-sm font-medium">
          {[
            { id: 'overview', label: 'Commercial Overview', icon: Activity },
            { id: 'catalog', label: 'B2B Products & Brands', icon: Package },
            { id: 'bulk_order', label: 'Rapid Bulk Order', icon: ShoppingCart },
            { id: 'orders', label: 'Orders & Fulfilment', icon: Truck },
            { id: 'quotations', label: 'Quotations & RFQs', icon: FileSpreadsheet },
            { id: 'businesses', label: 'Buyers & Credit', icon: Building2 },
            { id: 'copilot', label: 'Trade AI Agents', icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-[#C71D1D] text-[#C71D1D]'
                    : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-700'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-[#C71D1D]' : 'text-stone-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: COMMERCIAL OVERVIEW
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Gross B2B Revenue
                </span>
                <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                  <DollarSign className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-stone-900">
                {overview ? formatKes(overview.totalGrossRevenueCents) : '...'}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+22.4% vs last period across 4 brand lines</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Active B2B Buyers
                </span>
                <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
                  <Building2 className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-stone-900">
                {overview?.registeredBusinesses ?? '...'} Accounts
              </p>
              <div className="mt-2 text-xs text-stone-500">
                <span>{overview?.pendingApprovals ?? 0} pending KRA PIN verification</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Accounts Receivable
                </span>
                <span className="rounded-lg bg-amber-50 p-2 text-amber-600">
                  <Clock className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-stone-900">
                {overview ? `KES ${(overview.outstandingReceivablesKes || 0).toLocaleString()}` : '...'}
              </p>
              <div className="mt-2 text-xs text-amber-700">
                <span>Credit terms: Net 7, 14, 30, and 60 days</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Fulfilment & Stock
                </span>
                <span className="rounded-lg bg-orange-50 p-2 text-[#C71D1D]">
                  <Truck className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-stone-900">
                {overview?.totalOrders ?? '...'} Active Shipments
              </p>
              <div className="mt-2 text-xs text-red-600">
                <span>{overview?.lowStockProductsCount ?? 0} SKUs flagged low stock</span>
              </div>
            </div>
          </div>

          {/* Brand Breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    Rekker Portfolio Brand Performance
                  </h3>
                  <p className="text-xs text-stone-500">
                    Production allocation and B2B wholesale demand distribution
                  </p>
                </div>
                <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">
                  Q1 2026
                </span>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {brands.map((b: any) => (
                  <div
                    key={b.brand}
                    className="flex flex-col justify-between rounded-xl border border-stone-100 bg-stone-50 p-4 transition hover:border-red-200"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-stone-900">{b.brand}</span>
                        <span className="text-xs font-bold text-[#C71D1D]">
                          {b.revenueSharePct}% Share
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {b.catalogCount} Master Carton SKUs Active
                      </p>
                    </div>

                    <div className="mt-4">
                      <div className="h-2 w-full rounded-full bg-stone-200">
                        <div
                          className="h-2 rounded-full bg-[#C71D1D]"
                          style={{ width: `${b.revenueSharePct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance & Tax Regulations */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-bold text-stone-900">Kenya Regulatory Gates</h3>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Automated tax and data compliance controls
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800">KRA eTIMS Integration</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      ACTIVE
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-500">
                    Automatic generation of KRA control codes and 16% standard VAT breakdown.
                  </p>
                </div>

                <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800">Commercial Margin Floor</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      PROTECTED
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-500">
                    Strict rejection of prices below unit production cost + 8% margin.
                  </p>
                </div>

                <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800">ODPC & KDPA 2019 Privacy</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      COMPLIANT
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-500">
                    Masked customer banking credentials and audited Maker-Checker approvals.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: B2B PRODUCTS & BRANDS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase text-stone-400">Brand:</span>
              {['all', 'Saffron Milan', 'Bio Saff', 'Cornells', 'PetCare'].map((b) => (
                <button
                  key={b}
                  onClick={() => setBrandFilter(b)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    brandFilter === b
                      ? 'bg-[#C71D1D] text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {b === 'all' ? 'All Brands' : b}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search SKU or product..."
                className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-red-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {products
              .filter(
                (p: any) =>
                  !searchTerm ||
                  p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  p.sku.toLowerCase().includes(searchTerm.toLowerCase()),
              )
              .map((p: any) => (
                <div
                  key={p.id}
                  className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-red-300 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-600">
                        {p.brand}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          p.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {p.status.replace('_', ' ')}
                      </span>
                    </div>

                    <h4 className="mt-3 text-sm font-bold text-stone-900">{p.name}</h4>
                    <p className="mt-1 font-mono text-[11px] text-stone-400">{p.sku}</p>
                    <p className="mt-2 line-clamp-2 text-xs text-stone-500">{p.description}</p>

                    <div className="mt-4 rounded-xl border border-stone-100 bg-stone-50 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-stone-500">Packaging Unit:</span>
                        <span className="font-bold text-stone-800">
                          Master Carton ({p.unitsPerCarton} units)
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="text-stone-500">Unit Price:</span>
                        <span className="font-semibold text-stone-700">
                          KES {p.pricePerUnitKes} / piece
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-2 text-xs">
                        <span className="font-bold text-stone-800">Carton Price:</span>
                        <span className="font-extrabold text-[#C71D1D]">
                          KES {p.basePricePerCartonKes.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Stock Status */}
                    <div className="mt-3 flex items-center justify-between text-[11px]">
                      <span className="text-stone-500">Warehouse Stock:</span>
                      <span className="font-semibold text-stone-800">
                        {p.availableStockCartons} cartons available
                      </span>
                    </div>
                  </div>

                  {/* Add to Cart Actions */}
                  <div className="mt-5 border-t border-stone-100 pt-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAddToCart(p.id, 10)}
                        className="flex-1 rounded-xl bg-stone-900 py-2 text-center text-xs font-semibold text-white shadow-sm hover:bg-stone-800"
                      >
                        + 10 Cartons
                      </button>
                      <button
                        onClick={() => handleAddToCart(p.id, 50)}
                        className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-center text-xs font-semibold text-stone-700 hover:bg-stone-50"
                        title="Add 50 Cartons (Wholesale Tier)"
                      >
                        +50
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: RAPID BULK ORDER & CART
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'bulk_order' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Cart Items & Quantity Configuration */}
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-stone-900">Carton Bulk Order Matrix</h3>
                  <p className="text-xs text-stone-500">
                    Adjust master carton quantities to trigger wholesale volume breaks
                  </p>
                </div>
                {cartItemsArray.length > 0 && (
                  <button
                    onClick={handleClearCart}
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    Clear Cart
                  </button>
                )}
              </div>

              {cartItemsArray.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-stone-100 p-4 text-stone-400">
                    <ShoppingBag className="h-8 w-8" />
                  </div>
                  <h4 className="mt-3 text-sm font-bold text-stone-800">Your Trade Cart is Empty</h4>
                  <p className="mt-1 max-w-sm text-xs text-stone-500">
                    Explore our product catalog or use the Trade AI Copilot to draft a bulk carton order in seconds.
                  </p>
                  <button
                    onClick={() => setActiveTab('catalog')}
                    className="mt-4 rounded-xl bg-[#C71D1D] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-800"
                  >
                    Browse Catalog
                  </button>
                </div>
              ) : (
                <div className="mt-4 divide-y divide-stone-100">
                  {cartItemsArray.map(({ productId, quantityCartons }) => {
                    const prod = products.find((p: any) => p.id === productId);
                    return (
                      <div key={productId} className="flex items-center justify-between py-4">
                        <div className="max-w-[50%]">
                          <span className="text-[10px] font-bold uppercase text-stone-400">
                            {prod?.brand || 'Rekker'}
                          </span>
                          <h5 className="text-xs font-bold text-stone-900">{prod?.name}</h5>
                          <p className="text-[11px] text-stone-500">
                            KES {prod?.basePricePerCartonKes?.toLocaleString()} / carton (
                            {prod?.unitsPerCarton} units)
                          </p>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center rounded-lg border border-stone-200">
                            <button
                              onClick={() => handleUpdateCartQty(productId, quantityCartons - 5)}
                              className="px-2.5 py-1 text-xs font-bold text-stone-600 hover:bg-stone-100"
                            >
                              -
                            </button>
                            <span className="min-w-[40px] text-center text-xs font-bold text-stone-800">
                              {quantityCartons}
                            </span>
                            <button
                              onClick={() => handleUpdateCartQty(productId, quantityCartons + 5)}
                              className="px-2.5 py-1 text-xs font-bold text-stone-600 hover:bg-stone-100"
                            >
                              +
                            </button>
                          </div>

                          <div className="text-right">
                            <p className="text-xs font-bold text-stone-900">
                              KES{' '}
                              {(
                                (prod?.basePricePerCartonKes || 0) * quantityCartons
                              ).toLocaleString()}
                            </p>
                            <span className="text-[10px] text-stone-400">
                              {quantityCartons * (prod?.unitsPerCarton || 0)} units total
                            </span>
                          </div>

                          <button
                            onClick={() => handleUpdateCartQty(productId, 0)}
                            className="text-stone-400 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Buyer Account & Delivery Details */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-stone-900">Commercial Account & Fulfilment</h3>
              <p className="text-xs text-stone-500">
                Select registered B2B entity to apply verified credit terms and discounts
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-stone-700">Billing Business</label>
                  <select
                    value={selectedBusinessId}
                    onChange={(e) => setSelectedBusinessId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-medium text-stone-900 outline-none focus:border-red-500 focus:bg-white"
                  >
                    {businesses.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.legalName} ({b.businessType} - {b.creditTerms})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700">Purchase Order (PO) Ref</label>
                  <input
                    type="text"
                    value={poReference}
                    onChange={(e) => setPoReference(e.target.value)}
                    placeholder="e.g. PO-NAIVAS-2026-091"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-stone-700">Delivery Warehouse / Branch Address</label>
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="e.g. Central Depot, Baba Dogo Road, Ruaraka, Nairobi"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Authoritative Live Pricing Engine Summary */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-stone-900">Commercial Price Summary</h3>
              <p className="text-xs text-stone-500">Authoritative server-side calculation engine</p>

              {pricingPreview ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-stone-600">
                    <span>Total Cartons:</span>
                    <span className="font-bold text-stone-900">{pricingPreview.totalCartons} cartons</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-600">
                    <span>Tier Applied:</span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 font-bold text-stone-800">
                      {pricingPreview.appliedTier || 'Standard Wholesale'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-600">
                    <span>Gross Subtotal:</span>
                    <span>{formatKes(pricingPreview.subtotalCents)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-emerald-700">
                    <span>
                      Combined Discount ({pricingPreview.combinedDiscountPct}%):
                    </span>
                    <span>- {formatKes(pricingPreview.discountCents)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-600">
                    <span>16% Standard Kenya VAT:</span>
                    <span>+ {formatKes(pricingPreview.taxCents)}</span>
                  </div>

                  <div className="border-t border-stone-200 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-stone-900">Grand Total:</span>
                      <span className="text-lg font-extrabold text-[#C71D1D]">
                        {formatKes(pricingPreview.totalCents)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-stone-400">
                      Includes KRA eTIMS control stamp & dispatch allocation
                    </p>
                  </div>

                  <button
                    disabled={isSubmitting || cartItemsArray.length === 0}
                    onClick={handlePlaceOrder}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C71D1D] py-3 text-xs font-bold text-white shadow-md transition hover:bg-red-800 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Confirm & Submit B2B Order
                  </button>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-stone-400">
                  Add items to your cart to preview commercial pricing and volume discounts.
                </div>
              )}
            </div>

            {/* Wholesale Tier Guide */}
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
              <span className="text-[10px] font-bold uppercase text-stone-400">Volume Discounts</span>
              <h4 className="mt-1 text-xs font-bold text-stone-800">Automatic Carton Volume Breaks</h4>
              <ul className="mt-3 space-y-2 text-xs text-stone-600">
                <li className="flex items-center justify-between">
                  <span>20+ Cartons (Trade Starter):</span>
                  <span className="font-bold text-stone-900">+3% Rebate</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>50+ Cartons (Wholesale Bulk):</span>
                  <span className="font-bold text-[#C71D1D]">+6% Rebate</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>100+ Cartons (Master Distributor):</span>
                  <span className="font-bold text-emerald-700">+10% Rebate</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 4: ORDERS & FULFILMENT
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">B2B Order Fulfilment Stream</h3>
                <p className="text-xs text-stone-500">
                  Real-time lifecycle tracking from submission through warehouse dispatch
                </p>
              </div>
              <span className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600">
                {orders.length} Total Orders
              </span>
            </div>

            <div className="mt-4 divide-y divide-stone-100">
              {orders.map((o: any) => (
                <div key={o.id} className="py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-stone-900">
                          {o.orderNumber}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            o.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : o.status === 'dispatched'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {o.status}
                        </span>
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                          {o.paymentStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-stone-800">
                        {o.businessName} ·{' '}
                        <span className="text-stone-500">{o.branchName}</span>
                      </p>
                      {o.poReference && (
                        <p className="text-[11px] text-stone-400">PO Ref: {o.poReference}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-[#C71D1D]">
                          {formatKes(o.totalCents)}
                        </p>
                        <p className="text-[11px] text-stone-400">
                          {o.items?.length || 0} product lines
                        </p>
                      </div>

                      {/* Payment Action if pending */}
                      {o.paymentStatus !== 'paid' && (
                        <button
                          onClick={() => {
                            const inv = invoices.find((i: any) => i.orderId === o.id) || {
                              id: `inv-${o.id}`,
                              balanceDueCents: o.totalCents,
                              invoiceNumber: `INV-${o.orderNumber}`,
                            };
                            setSelectedInvoice(inv);
                            setShowMpesaModal(true);
                          }}
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                        >
                          Pay M-Pesa
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Order Line Items */}
                  <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50 p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {o.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-stone-700 font-medium truncate max-w-[70%]">
                            {item.quantity}× {item.productName}
                          </span>
                          <span className="font-mono text-stone-500">
                            {formatKes(item.totalCents)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 5: QUOTATIONS & RFQs
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'quotations' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">Commercial RFQ Quotation Desk</h3>
                <p className="text-xs text-stone-500">
                  Custom contract pricing proposals and high-volume commercial rebate negotiations
                </p>
              </div>
              <button
                onClick={() => {
                  setBanner({
                    type: 'success',
                    message: 'Drafting quotation proposal desk enabled.',
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-stone-800"
              >
                <Plus className="h-4 w-4" />
                New Quotation Proposal
              </button>
            </div>

            <div className="mt-4 divide-y divide-stone-100">
              {quotations.map((q: any) => (
                <div key={q.id} className="py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-stone-900">
                          {q.quotationNumber}
                        </span>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 uppercase">
                          {q.status}
                        </span>
                        <span className="text-xs text-stone-400">Valid until {q.validUntil}</span>
                      </div>
                      <h5 className="mt-1 text-xs font-bold text-stone-800">{q.businessName}</h5>
                      {q.customerNotes && (
                        <p className="mt-1 text-xs italic text-stone-500">"{q.customerNotes}"</p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-extrabold text-[#C71D1D]">
                        {formatKes(q.totalCents)}
                      </p>
                      <span className="text-[10px] font-bold text-emerald-700">
                        Gross Margin: {q.internalMarginPct}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 6: BUYERS & CREDIT MANAGEMENT
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'businesses' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Approved Wholesalers & Retail Accounts
                </h3>
                <p className="text-xs text-stone-500">
                  KRA PIN tax verification, trade tier discounts, and credit term governance
                </p>
              </div>
              <button
                onClick={() => setShowRegisterBizModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-stone-800"
              >
                <Plus className="h-4 w-4" />
                Onboard Business
              </button>
            </div>

            <div className="mt-4 divide-y divide-stone-100">
              {businesses.map((b: any) => (
                <div key={b.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-stone-900">{b.legalName}</span>
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                        {b.businessType}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          b.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                      <span>KRA PIN: {b.kraPin}</span>
                      <span>·</span>
                      <span>Contact: {b.primaryContactName} ({b.primaryPhone})</span>
                      <span>·</span>
                      <span>{b.physicalLocation}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs font-bold text-stone-800">
                        Credit Limit: KES {b.creditLimitKes?.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        Terms: {b.creditTerms} · Tier Discount: {b.tierDiscountPct}%
                      </p>
                    </div>

                    {b.status !== 'approved' && (
                      <button
                        onClick={() => handleVerifyBusiness(b.id, true)}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700"
                      >
                        Verify & Approve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 7: TRADE AI COPILOT & AGENT ECOSYSTEM
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'copilot' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Chat Window */}
          <div className="flex h-[600px] flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-red-100 p-2 text-[#C71D1D]">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Rekker Trade AI Specialist</h3>
                  <p className="text-[11px] text-stone-500">
                    Natural language carton assembly, volume calculations, and stock intelligence
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                ACTIVE AGENT
              </span>
            </div>

            {/* Message Area */}
            <div className="flex-1 space-y-4 overflow-y-auto py-4">
              {copilotMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-stone-900 text-white'
                        : 'border border-stone-100 bg-stone-50 text-stone-800'
                    }`}
                  >
                    <p>{msg.text}</p>

                    {/* Structured Agent Card (Draft Order / Stock Insights) */}
                    {msg.structured && msg.structured.actionable && (
                      <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3 text-stone-900">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                          <span className="font-bold text-[11px] text-[#C71D1D]">
                            {msg.structured.intent}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700">
                            {msg.structured.pricingBreakdown?.totalCartons} Cartons
                          </span>
                        </div>

                        <div className="mt-2 space-y-1.5">
                          {msg.structured.lineItems?.map((li: any, i: number) => (
                            <div key={i} className="flex justify-between text-[11px]">
                              <span>
                                {li.cartons}× {li.name}
                              </span>
                              <span className="font-semibold">
                                KES {li.effectiveLineTotalKes?.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2 font-bold text-xs">
                          <span>Total:</span>
                          <span className="text-[#C71D1D]">
                            KES {msg.structured.pricingBreakdown?.grandTotalKes?.toLocaleString()}
                          </span>
                        </div>

                        <button
                          onClick={() => applyAiDraftToCart(msg.structured.draftOrder?.items || [])}
                          className="mt-3 w-full rounded-lg bg-[#C71D1D] py-1.5 text-center text-xs font-bold text-white hover:bg-red-800"
                        >
                          Load into Cart & Checkout
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isCopilotThinking && (
                <div className="flex items-center gap-2 text-xs text-stone-400">
                  <Sparkles className="h-4 w-4 animate-spin text-[#C71D1D]" />
                  <span>Trade AI is analyzing catalog, price tiers, and stock on hand...</span>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendCopilot} className="border-t border-stone-100 pt-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={copilotInput}
                  onChange={(e) => setCopilotInput(e.target.value)}
                  placeholder="Ask e.g. 'I need 50 cartons of Saffron lotion and 20 cartons of pomade'..."
                  className="flex-1 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={isCopilotThinking || !copilotInput.trim()}
                  className="rounded-xl bg-[#C71D1D] p-2.5 text-white shadow hover:bg-red-800 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>

          {/* Right: Agent Suggestions */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Suggested Prompts
              </h4>
              <div className="mt-3 space-y-2">
                {[
                  'I need 60 cartons of Saffron Milan glow lotion for Chandarana',
                  'What is our current warehouse stock status and demand forecast?',
                  'Check distributor tier discount for a 120-carton order',
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setCopilotInput(prompt)}
                    className="w-full rounded-xl border border-stone-100 bg-stone-50 p-3 text-left text-xs font-medium text-stone-700 transition hover:border-red-200 hover:bg-red-50"
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
              <span className="text-[10px] font-bold uppercase text-stone-400">Agent Architecture</span>
              <h4 className="mt-1 text-xs font-bold text-stone-800">StateGraph Orchestration</h4>
              <p className="mt-2 text-xs leading-relaxed text-stone-500">
                The Rekker Trade AI agent dynamically routes queries between the Bulk Order Specialist, Margin Protection Guard, and Demand Forecasting Engine.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: REGISTER BUSINESS ONBOARDING
      ───────────────────────────────────────────────────────────── */}
      {showRegisterBizModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">Onboard B2B Customer Account</h3>
              <button
                onClick={() => setShowRegisterBizModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterBusiness} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-700">Legal Registered Name</label>
                <input
                  required
                  type="text"
                  value={newBizLegalName}
                  onChange={(e) => setNewBizLegalName(e.target.value)}
                  placeholder="e.g. QuickMart Supermarkets East Africa Ltd"
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700">Trading Name</label>
                  <input
                    type="text"
                    value={newBizTradingName}
                    onChange={(e) => setNewBizTradingName(e.target.value)}
                    placeholder="e.g. QuickMart Lavington"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700">Business Type</label>
                  <select
                    value={newBizType}
                    onChange={(e) => setNewBizType(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  >
                    <option value="distributor">Distributor (Wholesale)</option>
                    <option value="wholesaler">Wholesaler</option>
                    <option value="retailer">Retailer / Supermarket</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700">KRA PIN (Mandatory)</label>
                  <input
                    required
                    type="text"
                    value={newBizKraPin}
                    onChange={(e) => setNewBizKraPin(e.target.value)}
                    placeholder="P051234567Z"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs uppercase outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700">Reg / CPR Number</label>
                  <input
                    type="text"
                    value={newBizRegNo}
                    onChange={(e) => setNewBizRegNo(e.target.value)}
                    placeholder="CPR/2026/12345"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700">Contact Person</label>
                  <input
                    type="text"
                    value={newBizContact}
                    onChange={(e) => setNewBizContact(e.target.value)}
                    placeholder="Jane Muthoni"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700">Phone</label>
                  <input
                    type="text"
                    value={newBizPhone}
                    onChange={(e) => setNewBizPhone(e.target.value)}
                    placeholder="+254711223344"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Primary Email</label>
                <input
                  type="email"
                  value={newBizEmail}
                  onChange={(e) => setNewBizEmail(e.target.value)}
                  placeholder="procurement@buyer.co.ke"
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Physical Address / County</label>
                <input
                  type="text"
                  value={newBizLocation}
                  onChange={(e) => setNewBizLocation(e.target.value)}
                  placeholder="Westlands, Nairobi, Kenya"
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRegisterBizModal(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-[#C71D1D] px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-800 disabled:opacity-50"
                >
                  Submit for Compliance Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: M-PESA B2B STK PUSH SETTLEMENT
      ───────────────────────────────────────────────────────────── */}
      {showMpesaModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-stone-900">M-Pesa B2B Settlement</h3>
                  <p className="text-[11px] text-stone-500">Safaricom Daraja STK Push Integration</p>
                </div>
              </div>
              <button
                onClick={() => setShowMpesaModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                <div className="flex justify-between text-xs text-stone-600">
                  <span>Invoice Number:</span>
                  <span className="font-mono font-bold text-stone-900">
                    {selectedInvoice.invoiceNumber}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-xs text-stone-600">
                  <span>Amount Due:</span>
                  <span className="text-sm font-extrabold text-[#C71D1D]">
                    {formatKes(selectedInvoice.balanceDueCents)}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">
                  M-Pesa Registered Mobile Number
                </label>
                <input
                  type="text"
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="+2547XXXXXXXX"
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-mono outline-none focus:border-red-500 focus:bg-white"
                />
                <p className="mt-1 text-[11px] text-stone-400">
                  A Daraja STK Push prompt will be dispatched to this phone.
                </p>
              </div>

              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowMpesaModal(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleTriggerMpesa}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Authorize STK Push
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TradePage;
