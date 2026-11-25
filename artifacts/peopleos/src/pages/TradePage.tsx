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
  ClipboardCheck,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  MapPin,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Award,
  BarChart3,
  PieChart as PieIcon,
  Tag,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  X,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { apiGet, apiPost } from '../lib/api';

export function TradePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    'overview' | 'catalog' | 'bulk_order' | 'orders' | 'dispatch' | 'procurement' | 'reconciliations' | 'crm' | 'quotations' | 'businesses' | 'copilot'
  >('overview');

  // Brand filter
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Commercial Analytics Sub-view & Timeframe State
  const [analyticsView, setAnalyticsView] = useState<'all' | 'revenue_trends' | 'debtors_dso' | 'territories' | 'leaderboard'>('all');
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<'mtd' | 'q1' | 'rolling_6m'>('q1');

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

  // Dispatch Modal State
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchOrderId, setDispatchOrderId] = useState('');
  const [dispatchWarehouse, setDispatchWarehouse] = useState('WH-NBO-01');
  const [dispatchDriver, setDispatchDriver] = useState('');
  const [dispatchVehicle, setDispatchVehicle] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');

  // POD Modal State
  const [showPodModal, setShowPodModal] = useState(false);
  const [podShipmentId, setPodShipmentId] = useState('');
  const [podRecipient, setPodRecipient] = useState('');

  // Procurement / New PO Modal State
  const [showNewPoModal, setShowNewPoModal] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poWarehouseCode, setPoWarehouseCode] = useState('WH-NBO-01');
  const [poExpectedDate, setPoExpectedDate] = useState('');
  const [poLineItems, setPoLineItems] = useState<
    Array<{ materialId: string; quantity: number; unitPriceCents: number }>
  >([{ materialId: '', quantity: 0, unitPriceCents: 0 }]);

  // Phase 2 Modals & State: Debtor Statement of Account
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [selectedStatementBusinessId, setSelectedStatementBusinessId] = useState<string>('biz-001');

  // Phase 2 Modals & State: Bank Reconciliation
  const [showRecordReconModal, setShowRecordReconModal] = useState(false);
  const [reconInvoiceId, setReconInvoiceId] = useState('');
  const [reconPaymentMethod, setReconPaymentMethod] = useState<'rtgs_eft' | 'mpesa_paybill' | 'direct_deposit' | 'cheque'>('rtgs_eft');
  const [reconBankName, setReconBankName] = useState('Stanbic Bank Kenya');
  const [reconRefNumber, setReconRefNumber] = useState('');
  const [reconAmountKes, setReconAmountKes] = useState('');

  // Phase 2 Modals & State: Field CRM & Sales Rep Interactions
  const [showLogInteractionModal, setShowLogInteractionModal] = useState(false);
  const [interactionBizId, setInteractionBizId] = useState('biz-001');
  const [interactionSalesRepId, setInteractionSalesRepId] = useState('rep-001');
  const [interactionType, setInteractionType] = useState<'site_visit' | 'order_followup' | 'debt_collection' | 'complaint_resolution' | 'product_demo'>('site_visit');
  const [interactionSummary, setInteractionSummary] = useState('');
  const [interactionOutcome, setInteractionOutcome] = useState<'positive' | 'order_secured' | 'pending_decision' | 'followup_required'>('positive');
  const [interactionFollowUpDate, setInteractionFollowUpDate] = useState('');

  // Print Invoice View
  const [printInvoiceData, setPrintInvoiceData] = useState<any | null>(null);

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

  // New Phase-1 queries
  const warehousesQuery = useQuery({
    queryKey: ['trade-warehouses'],
    queryFn: () => apiGet<any>('/api/trade/warehouses'),
  });

  const shipmentsQuery = useQuery({
    queryKey: ['trade-shipments'],
    queryFn: () => apiGet<any>('/api/trade/shipments'),
  });

  const suppliersQuery = useQuery({
    queryKey: ['trade-suppliers'],
    queryFn: () => apiGet<any>('/api/trade/procurement/suppliers'),
  });

  const materialsQuery = useQuery({
    queryKey: ['trade-materials'],
    queryFn: () => apiGet<any>('/api/trade/procurement/materials'),
  });

  const procurementOrdersQuery = useQuery({
    queryKey: ['trade-procurement-orders'],
    queryFn: () => apiGet<any>('/api/trade/procurement/orders'),
  });

  // Phase 2 queries
  const reconciliationsQuery = useQuery({
    queryKey: ['trade-reconciliations'],
    queryFn: () => apiGet<any>('/api/trade/reconciliations'),
  });

  const salesRepsQuery = useQuery({
    queryKey: ['trade-sales-reps'],
    queryFn: () => apiGet<any>('/api/trade/crm/sales-reps'),
  });

  const interactionsQuery = useQuery({
    queryKey: ['trade-interactions'],
    queryFn: () => apiGet<any>('/api/trade/crm/interactions'),
  });

  const commercialAnalyticsQuery = useQuery({
    queryKey: ['trade-commercial-analytics'],
    queryFn: () => apiGet<any>('/api/trade/analytics/commercial'),
  });

  const statementQuery = useQuery({
    queryKey: ['trade-statement', selectedStatementBusinessId],
    queryFn: () => apiGet<any>(`/api/trade/businesses/${selectedStatementBusinessId}/statement`),
    enabled: Boolean(selectedStatementBusinessId) && showStatementModal,
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

  // Dispatch Shipment Handler
  const handleDispatchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchOrderId) {
      setBanner({ type: 'error', message: 'Order ID is required for dispatch.' });
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await apiPost<any>('/api/trade/shipments/dispatch', {
        orderId: dispatchOrderId,
        warehouseCode: dispatchWarehouse,
        assignedDriverName: dispatchDriver.trim() || 'John Mwangi (Rekker Fleet)',
        vehicleRegistration: dispatchVehicle.trim() || 'KDM 482B',
        deliveryNotes: dispatchNotes.trim() || undefined,
      });
      setBanner({
        type: 'success',
        message: `Shipment ${res.shipment?.consignmentNumber} dispatched via ${res.shipment?.assignedDriverName} (${res.shipment?.vehicleRegistration}) from ${res.shipment?.warehouseCode}!`,
      });
      setShowDispatchModal(false);
      setDispatchOrderId('');
      setDispatchNotes('');
      qc.invalidateQueries({ queryKey: ['trade-shipments'] });
      qc.invalidateQueries({ queryKey: ['trade-orders'] });
      qc.invalidateQueries({ queryKey: ['trade-overview'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Dispatch allocation failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Proof of Delivery (POD) Handler
  const handleConfirmPod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podShipmentId) return;
    try {
      setIsSubmitting(true);
      const res = await apiPost<any>(`/api/trade/shipments/${podShipmentId}/deliver`, {
        recipientName: podRecipient.trim() || 'Store Receiving Manager',
      });
      setBanner({
        type: 'success',
        message: `Proof of Delivery recorded for ${res.shipment?.consignmentNumber}. Recipient: ${res.shipment?.podRecipientName}. Status: DELIVERED.`,
      });
      setShowPodModal(false);
      setPodShipmentId('');
      setPodRecipient('');
      qc.invalidateQueries({ queryKey: ['trade-shipments'] });
      qc.invalidateQueries({ queryKey: ['trade-orders'] });
      qc.invalidateQueries({ queryKey: ['trade-overview'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'POD recording failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Printable Tax Invoice Fetcher
  const handleFetchPrintInvoice = async (invoiceId: string) => {
    try {
      const data = await apiGet<any>(`/api/trade/invoices/${invoiceId}/print`);
      setPrintInvoiceData(data);
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Could not load printable tax invoice.' });
    }
  };

  // Create Supplier Purchase Order
  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poSupplierId) {
      setBanner({ type: 'error', message: 'Please select a supplier.' });
      return;
    }
    const validLines = poLineItems.filter((line) => line.materialId && line.quantity > 0);
    if (validLines.length === 0) {
      setBanner({ type: 'error', message: 'Please specify at least one raw material line item.' });
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await apiPost<any>('/api/trade/procurement/orders', {
        supplierId: poSupplierId,
        warehouseCode: poWarehouseCode,
        expectedDeliveryDate: poExpectedDate || new Date(Date.now() + 5 * 86400000).toISOString(),
        items: validLines,
      });
      setBanner({
        type: 'success',
        message: `Purchase Order ${res.purchaseOrder?.poNumber} successfully issued to ${res.purchaseOrder?.supplierName}! Total: ${formatKes(res.purchaseOrder?.totalCostCents)}.`,
      });
      setShowNewPoModal(false);
      setPoSupplierId('');
      setPoLineItems([{ materialId: '', quantity: 0, unitPriceCents: 0 }]);
      qc.invalidateQueries({ queryKey: ['trade-procurement-orders'] });
      qc.invalidateQueries({ queryKey: ['trade-materials'] });
      qc.invalidateQueries({ queryKey: ['trade-overview'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Failed to issue Purchase Order.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Receive Goods / GRN
  const handleReceivePo = async (poId: string) => {
    try {
      setIsSubmitting(true);
      const res = await apiPost<any>(`/api/trade/procurement/orders/${poId}/receive`, {
        receivedBy: 'Operations Procurement Specialist',
      });
      setBanner({
        type: 'success',
        message: `Goods Received Note (GRN) confirmed for PO ${res.purchaseOrder?.poNumber}. Raw materials inventory credited!`,
      });
      qc.invalidateQueries({ queryKey: ['trade-procurement-orders'] });
      qc.invalidateQueries({ queryKey: ['trade-materials'] });
      qc.invalidateQueries({ queryKey: ['trade-warehouses'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Failed to process GRN receipt.' });
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

  // Phase 2 Handlers: Statement of Account
  const handleOpenStatement = (bizId: string) => {
    setSelectedStatementBusinessId(bizId);
    setShowStatementModal(true);
  };

  // Phase 2 Handlers: Bank Reconciliation
  const handleRecordReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconInvoiceId || !reconRefNumber.trim() || !reconAmountKes) {
      setBanner({ type: 'error', message: 'Invoice, reference number, and amount are required.' });
      return;
    }
    const amountCents = Math.round(Number(reconAmountKes) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      setBanner({ type: 'error', message: 'Please enter a valid payment amount.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await apiPost<any>('/api/trade/reconciliations', {
        invoiceId: reconInvoiceId,
        paymentMethod: reconPaymentMethod,
        referenceNumber: reconRefNumber.trim(),
        amountCents,
        bankName: reconBankName,
      });

      setBanner({
        type: 'success',
        message: `Bank payment verified! Reference ${res.reconciliation?.referenceNumber} reconciled for ${res.reconciliation?.invoiceNumber}.`,
      });
      setShowRecordReconModal(false);
      setReconInvoiceId('');
      setReconRefNumber('');
      setReconAmountKes('');
      qc.invalidateQueries({ queryKey: ['trade-reconciliations'] });
      qc.invalidateQueries({ queryKey: ['trade-invoices'] });
      qc.invalidateQueries({ queryKey: ['trade-orders'] });
      qc.invalidateQueries({ queryKey: ['trade-overview'] });
      qc.invalidateQueries({ queryKey: ['trade-commercial-analytics'] });
      if (selectedStatementBusinessId) {
        qc.invalidateQueries({ queryKey: ['trade-statement', selectedStatementBusinessId] });
      }
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Failed to record bank reconciliation.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Phase 2 Handlers: Field CRM Interaction
  const handleLogInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interactionBizId || !interactionSummary.trim()) {
      setBanner({ type: 'error', message: 'Customer account and interaction summary are required.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await apiPost<any>('/api/trade/crm/interactions', {
        businessId: interactionBizId,
        salesRepId: interactionSalesRepId,
        interactionType,
        summary: interactionSummary.trim(),
        outcome: interactionOutcome,
        nextFollowUpDate: interactionFollowUpDate || undefined,
      });

      setBanner({
        type: 'success',
        message: `Field visit notes logged for ${res.interaction?.businessName} by ${res.interaction?.salesRepName}.`,
      });
      setShowLogInteractionModal(false);
      setInteractionSummary('');
      setInteractionFollowUpDate('');
      qc.invalidateQueries({ queryKey: ['trade-interactions'] });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Failed to log field interaction.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Phase 2 Handlers: Export Commercial Analytics CSV
  const handleExportCommercialCsv = () => {
    if (!commercialAnalytics) return;
    let csv = '=== REKKER TRADE COMMERCIAL ANALYTICS & EXECUTIVE BI ===\n';
    csv += `Export Timestamp,${new Date().toISOString()}\n`;
    csv += `Total Gross Revenue (KES),${Math.round((commercialAnalytics.summary?.totalGrossRevenueCents || 0) / 100)}\n`;
    csv += `Total Outstanding Receivables (KES),${Math.round((commercialAnalytics.summary?.totalOutstandingReceivablesCents || 0) / 100)}\n`;
    csv += `Days Sales Outstanding (DSO),${commercialAnalytics.summary?.daysSalesOutstandingDSO || 28} Days\n`;
    csv += `Collection Efficiency,${commercialAnalytics.summary?.collectionEfficiencyPct || 91.4}%\n\n`;

    csv += '=== BRAND PERFORMANCE & MARGINS ===\n';
    csv += 'Brand,Category,Revenue (KES),Market Share %,Carton Velocity,Gross Margin %,Avg Carton Price (KES)\n';
    (commercialAnalytics.brands || []).forEach((b: any) => {
      csv += `"${b.brand}","${b.category || ''}",${Math.round(b.revenueCents / 100)},${b.marketSharePct}%,${b.cartonVelocity},${b.grossMarginPct || ''}%,${b.avgCartonPriceKes || ''}\n`;
    });
    csv += '\n';

    csv += '=== REGIONAL & COUNTY FULFILMENT ===\n';
    csv += 'County/Region,Fulfilment Hub,Revenue (KES),Active Retailers,YoY Growth %,Cartons Shipped,On-Time Fulfilment %\n';
    (commercialAnalytics.regions || []).forEach((r: any) => {
      csv += `"${r.county}","${r.hubs}",${Math.round(r.revenueCents / 100)},${r.activeBuyers},${r.growthPct}%,${r.cartonsShipped || ''},${r.onTimeFulfilmentPct || ''}%\n`;
    });
    csv += '\n';

    csv += '=== 6-MONTH REVENUE & CASH COLLECTIONS TREND ===\n';
    csv += 'Month,Invoiced (KES),Cash Collected (KES),Target (KES),DSO (Days)\n';
    (commercialAnalytics.monthlyTrends || []).forEach((m: any) => {
      csv += `"${m.month}",${Math.round(m.invoicedCents / 100)},${Math.round(m.collectedCents / 100)},${Math.round(m.targetCents / 100)},${m.dsoDays}\n`;
    });
    csv += '\n';

    csv += '=== SALES REPRESENTATIVE QUOTA LEADERBOARD ===\n';
    csv += 'Rank,Representative,Code,Territory,Target (KES),Achieved (KES),Achievement %,Active Accounts,Commission (KES)\n';
    (commercialAnalytics.salesRepLeaderboard || []).forEach((s: any) => {
      csv += `${s.rank},"${s.name}","${s.code}","${s.territory}",${Math.round(s.monthlyTargetCents / 100)},${Math.round(s.achievedCents / 100)},${s.achievementPct}%,${s.activeAccounts},${Math.round(s.commissionEarnedCents / 100)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rekker_trade_commercial_bi_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setBanner({
      type: 'success',
      message: 'Commercial Analytics CSV census exported successfully.',
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

  // New Phase-1 datasets
  const warehouses = warehousesQuery.data?.warehouses || [];
  const shipments = shipmentsQuery.data?.shipments || [];
  const suppliers = suppliersQuery.data?.suppliers || [];
  const materials = materialsQuery.data?.materials || [];
  const procurementOrders = procurementOrdersQuery.data?.purchaseOrders || [];

  // Phase 2 datasets
  const reconciliations = reconciliationsQuery.data?.reconciliations || [];
  const salesReps = salesRepsQuery.data?.salesReps || [];
  const interactions = interactionsQuery.data?.interactions || [];
  const commercialAnalytics = commercialAnalyticsQuery.data;
  const statement = statementQuery.data;

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
            { id: 'dispatch', label: 'Dispatch & Warehouses', icon: Warehouse },
            { id: 'procurement', label: 'Procurement Desk', icon: Layers },
            { id: 'reconciliations', label: 'Treasury & Bank Recon', icon: CreditCard },
            { id: 'crm', label: 'Field CRM & Reps', icon: Users },
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
          TAB 1: COMMERCIAL OVERVIEW & B2B ANALYTICS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Executive Control & Header Bar */}
          <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-red-100 p-1.5 text-[#C71D1D]">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C71D1D]">
                  Enterprise BI & Revenue Operations
                </span>
              </div>
              <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-stone-900">
                Commercial Executive Analytics & Debtor Intelligence
              </h2>
              <p className="mt-0.5 text-xs text-stone-500">
                Live volume breaks, cash collection velocity, 47-county wholesale distribution, and DSO schedules.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Timeframe Selector */}
              <div className="inline-flex rounded-xl bg-stone-100 p-1 text-xs font-semibold">
                {(
                  [
                    ['mtd', 'MTD (Mar)'],
                    ['q1', 'Q1 2026'],
                    ['rolling_6m', 'Rolling 6M'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAnalyticsTimeframe(key)}
                    className={`rounded-lg px-2.5 py-1 transition ${
                      analyticsTimeframe === key
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-500 hover:text-stone-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm hover:bg-stone-50"
              >
                <Printer className="h-3.5 w-3.5 text-stone-500" />
                Print Brief
              </button>

              <button
                type="button"
                onClick={handleExportCommercialCsv}
                className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-stone-800"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV Census
              </button>
            </div>
          </div>

          {/* Sub-view Navigation Pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-2 text-xs">
            {(
              [
                ['all', 'All Intelligence', Activity],
                ['revenue_trends', 'Revenue & Collections Waterfall', TrendingUp],
                ['debtors_dso', 'Debtor Aging & DSO Waterfall', Clock],
                ['territories', 'Regional Fulfilment & Hubs', MapPin],
                ['leaderboard', 'Sales Rep Quota Leaderboard', Award],
              ] as const
            ).map(([viewId, label, Icon]) => (
              <button
                key={viewId}
                type="button"
                onClick={() => setAnalyticsView(viewId)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-semibold transition ${
                  analyticsView === viewId
                    ? 'bg-[#C71D1D] text-white shadow-sm'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Key Executive KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Gross Wholesale Revenue
                </span>
                <span className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
                  <DollarSign className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
                {commercialAnalytics?.summary?.totalGrossRevenueCents
                  ? formatKes(commercialAnalytics.summary.totalGrossRevenueCents)
                  : formatKes(overview?.totalGrossRevenueCents || 444200000)}
              </p>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                <TrendingUp className="h-3 w-3" />
                <span>+22.4% YoY · 88.8% Q1 Target</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Cash Collected (Remitted)
                </span>
                <span className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
                  <BadgeCheck className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
                KES 4.06M
              </p>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-blue-700">
                <span>91.4% Collection Efficiency Rate</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Outstanding Receivables
                </span>
                <span className="rounded-lg bg-amber-50 p-1.5 text-amber-600">
                  <Clock className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
                {commercialAnalytics?.summary?.totalOutstandingReceivablesCents
                  ? formatKes(commercialAnalytics.summary.totalOutstandingReceivablesCents)
                  : `KES ${(overview?.outstandingReceivablesKes || 39300).toLocaleString()}`}
              </p>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                <Check className="h-3 w-3" />
                <span>DSO: 28 Days (Target &lt; 30d)</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Carton Velocity Shipped
                </span>
                <span className="rounded-lg bg-red-50 p-1.5 text-[#C71D1D]">
                  <Package className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
                {commercialAnalytics?.summary?.totalCartonsShipped || 3800} <span className="text-xs font-normal text-stone-500">Cartons</span>
              </p>
              <div className="mt-1 text-[11px] text-stone-500">
                <span>127 Active Wholesaler Accounts</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Portfolio Gross Margin
                </span>
                <span className="rounded-lg bg-purple-50 p-1.5 text-purple-600">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
                {commercialAnalytics?.summary?.overallGrossMarginPct || 30.8}%
              </p>
              <div className="mt-1 text-[11px] text-emerald-700">
                <span>+8% Minimum Margin Floor Active</span>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              VIEW SECTION: REVENUE & CASH COLLECTIONS WATERFALL
          ───────────────────────────────────────────────────────────── */}
          {(analyticsView === 'all' || analyticsView === 'revenue_trends') && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Composed Chart: 6-Month Invoiced vs Collected vs Target */}
              <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-stone-900">
                      Monthly Invoiced Revenue vs Cash Collections & Target
                    </h3>
                    <p className="text-xs text-stone-500">
                      Comparing wholesale invoices issued against verified RTGS/EFT remittances in Kenya Shillings
                    </p>
                  </div>
                  <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">
                    Oct 2025 – Mar 2026
                  </span>
                </div>

                <div className="mt-4 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={(commercialAnalytics?.monthlyTrends || [
                        { month: 'Oct 2025', invoicedCents: 340000000, collectedCents: 310000000, targetCents: 320000000 },
                        { month: 'Nov 2025', invoicedCents: 385000000, collectedCents: 350000000, targetCents: 360000000 },
                        { month: 'Dec 2025', invoicedCents: 490000000, collectedCents: 460000000, targetCents: 440000000 },
                        { month: 'Jan 2026', invoicedCents: 410000000, collectedCents: 395000000, targetCents: 400000000 },
                        { month: 'Feb 2026', invoicedCents: 435000000, collectedCents: 418000000, targetCents: 420000000 },
                        { month: 'Mar 2026', invoicedCents: 444200000, collectedCents: 406000000, targetCents: 450000000 },
                      ]).map((m: any) => ({
                        month: m.month.replace(' 2025', '').replace(' 2026', ''),
                        Invoiced: Math.round(m.invoicedCents / 100000), // in KES '000
                        Collected: Math.round(m.collectedCents / 100000),
                        Target: Math.round(m.targetCents / 100000),
                      }))}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#78716c' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#78716c' }} unit="k" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid #e7e5e4',
                          fontSize: '11px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                        formatter={(val: any) => [`KES ${(Number(val) * 1000).toLocaleString('en-KE')}`]}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="Invoiced" name="Invoiced Revenue" fill="#C71D1D" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Collected" name="Cash Collected" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="Target" name="Monthly Target" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Brand Market Share Donut Chart */}
              <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="border-b border-stone-100 pb-3">
                  <h3 className="text-base font-bold text-stone-900">Brand Portfolio Revenue Share</h3>
                  <p className="text-xs text-stone-500">Margin contribution & volume velocity</p>
                </div>

                <div className="mt-4 h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={commercialAnalytics?.brands || [
                          { brand: 'Saffron Milan', revenueCents: 184500000 },
                          { brand: 'Bio Saff', revenueCents: 128900000 },
                          { brand: 'Cornells', revenueCents: 85200000 },
                          { brand: 'PetCare', revenueCents: 45600000 },
                        ]}
                        dataKey="revenueCents"
                        nameKey="brand"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                      >
                        {['#C71D1D', '#059669', '#d97706', '#4f46e5'].map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid #e7e5e4',
                          fontSize: '11px',
                        }}
                        formatter={(val: any) => [formatKes(Number(val))]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-2 space-y-2 text-xs">
                  {(commercialAnalytics?.brands || [
                    { brand: 'Saffron Milan', revenueCents: 184500000, marketSharePct: 41.5, grossMarginPct: 32.4, color: '#C71D1D' },
                    { brand: 'Bio Saff', revenueCents: 128900000, marketSharePct: 29.0, grossMarginPct: 28.6, color: '#059669' },
                    { brand: 'Cornells', revenueCents: 85200000, marketSharePct: 19.2, grossMarginPct: 35.1, color: '#d97706' },
                    { brand: 'PetCare', revenueCents: 45600000, marketSharePct: 10.3, grossMarginPct: 24.8, color: '#4f46e5' },
                  ]).map((b: any, idx: number) => {
                    const colors = ['#C71D1D', '#059669', '#d97706', '#4f46e5'];
                    return (
                      <div key={b.brand} className="flex items-center justify-between border-b border-stone-50 pb-1.5 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }} />
                          <span className="font-semibold text-stone-800">{b.brand}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-stone-500">{b.marketSharePct}%</span>
                          <span className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-bold text-emerald-800">
                            {b.grossMarginPct || 30}% Margin
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              VIEW SECTION: DEBTOR AGING WATERFALL & DSO WORKING CAPITAL
          ───────────────────────────────────────────────────────────── */}
          {(analyticsView === 'all' || analyticsView === 'debtors_dso') && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Accounts Receivable Aging Waterfall Chart */}
              <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:col-span-2">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-stone-900">
                      Debtor Aging Schedule & Accounts Receivable Waterfall
                    </h3>
                    <p className="text-xs text-stone-500">
                      Statutory credit risk exposure categorized across 0-30, 31-60, 61-90, and 90+ days aging buckets
                    </p>
                  </div>
                  <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">
                    Credit Cap: KES 50M
                  </span>
                </div>

                <div className="mt-4 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(commercialAnalytics?.agingWaterfall || [
                        { bucket: '0 - 30 Days', amount: 245000, count: 18, color: '#059669' },
                        { bucket: '31 - 60 Days', amount: 92000, count: 7, color: '#d97706' },
                        { bucket: '61 - 90 Days', amount: 41000, count: 3, color: '#ea580c' },
                        { bucket: '90+ Days', amount: 15000, count: 2, color: '#C71D1D' },
                      ]).map((a: any) => ({
                        bucket: a.bucket,
                        AmountKes: a.amountCents ? Math.round(a.amountCents / 100) : a.amount,
                        Count: a.count,
                        color: a.color,
                      }))}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#78716c' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#78716c' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid #e7e5e4',
                          fontSize: '11px',
                        }}
                        formatter={(val: any) => [`KES ${Number(val).toLocaleString('en-KE')}`, 'Outstanding']}
                      />
                      <Bar dataKey="AmountKes" name="Outstanding Balance" radius={[6, 6, 0, 0]}>
                        {['#059669', '#d97706', '#ea580c', '#C71D1D'].map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                    <span className="font-bold text-emerald-800">0 - 30 Days</span>
                    <p className="mt-1 font-mono font-bold text-stone-900">KES 245,000</p>
                    <span className="text-[10px] text-stone-500">18 Invoices · 62.4%</span>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5">
                    <span className="font-bold text-amber-800">31 - 60 Days</span>
                    <p className="mt-1 font-mono font-bold text-stone-900">KES 92,000</p>
                    <span className="text-[10px] text-stone-500">7 Invoices · 23.4%</span>
                  </div>
                  <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-2.5">
                    <span className="font-bold text-orange-800">61 - 90 Days</span>
                    <p className="mt-1 font-mono font-bold text-stone-900">KES 41,000</p>
                    <span className="text-[10px] text-stone-500">3 Invoices · 10.4%</span>
                  </div>
                  <div className="rounded-xl border border-red-100 bg-red-50/50 p-2.5">
                    <span className="font-bold text-red-800">90+ Days (Hold)</span>
                    <p className="mt-1 font-mono font-bold text-stone-900">KES 15,000</p>
                    <span className="text-[10px] text-stone-500">2 Invoices · 3.8%</span>
                  </div>
                </div>
              </div>

              {/* Working Capital & DSO Gauge */}
              <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-[#C71D1D]" />
                    <h3 className="text-base font-bold text-stone-900">Liquidity & DSO Benchmarking</h3>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">Working capital recovery pace</p>

                  <div className="mt-5 space-y-4">
                    <div className="rounded-xl border border-stone-100 bg-stone-50 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-stone-600">Days Sales Outstanding</span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          PERFORMING
                        </span>
                      </div>
                      <p className="mt-2 text-3xl font-extrabold text-stone-900">
                        28 <span className="text-sm font-normal text-stone-500">Days</span>
                      </p>
                      <p className="mt-1 text-[11px] text-stone-500">
                        Improved by 6 days from Oct 2025 (34d). Kenya FMCG industry norm: &lt; 35 days.
                      </p>
                    </div>

                    <div className="rounded-xl border border-stone-100 bg-stone-50 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-stone-600">Credit Risk Mitigation</span>
                        <span className="text-xs font-bold text-emerald-700">96.2% Covered</span>
                      </div>
                      <div className="mt-2 h-2 w-full rounded-full bg-stone-200">
                        <div className="h-2 rounded-full bg-emerald-600" style={{ width: '96.2%' }} />
                      </div>
                      <p className="mt-2 text-[11px] text-stone-500">
                        Overdue &gt;60 days represents only 14.2% of total receivables. Automatic credit holds enforced.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t border-stone-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab('reconciliations')}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 py-2.5 text-xs font-bold text-white shadow hover:bg-stone-800"
                  >
                    <CreditCard className="h-4 w-4" />
                    Open Bank Reconciliations
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              VIEW SECTION: SALES REP QUOTA LEADERBOARD & COMMISSIONS
          ───────────────────────────────────────────────────────────── */}
          {(analyticsView === 'all' || analyticsView === 'leaderboard') && (
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    Sales Representative Quota Leaderboard & Earned Commissions
                  </h3>
                  <p className="text-xs text-stone-500">
                    Live territory performance pacing against monthly wholesale targets across Kenya
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('crm')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm hover:bg-stone-50"
                >
                  <Users className="h-3.5 w-3.5 text-stone-500" />
                  View CRM Visit Journal
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(commercialAnalytics?.salesRepLeaderboard || [
                  { rank: 1, name: 'Kelvin Maina', code: 'SR-NBO-01', territory: 'Nairobi Central', monthlyTargetCents: 150000000, achievedCents: 142000000, achievementPct: 94.7, activeAccounts: 24, commissionEarnedCents: 3550000 },
                  { rank: 2, name: 'Faith Mwangi', code: 'SR-MSA-01', territory: 'Mombasa & Coast', monthlyTargetCents: 100000000, achievedCents: 88000000, achievementPct: 88.0, activeAccounts: 18, commissionEarnedCents: 2640000 },
                  { rank: 3, name: 'Brian Otieno', code: 'SR-KSM-01', territory: 'Western & Kisumu', monthlyTargetCents: 80000000, achievedCents: 69000000, achievementPct: 86.3, activeAccounts: 14, commissionEarnedCents: 2415000 },
                  { rank: 4, name: 'Dennis Kipchirchir', code: 'SR-NKR-01', territory: 'Rift Valley & Nakuru', monthlyTargetCents: 70000000, achievedCents: 54000000, achievementPct: 77.1, activeAccounts: 11, commissionEarnedCents: 1890000 },
                ]).map((rep: any) => (
                  <div key={rep.name} className="relative rounded-xl border border-stone-100 bg-stone-50 p-4 transition hover:border-red-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold ${
                              rep.rank === 1
                                ? 'bg-amber-100 text-amber-800'
                                : rep.rank === 2
                                ? 'bg-stone-200 text-stone-700'
                                : rep.rank === 3
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-stone-100 text-stone-500'
                            }`}
                          >
                            #{rep.rank}
                          </span>
                          <span className="text-xs font-bold text-stone-900">{rep.name}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-stone-500">{rep.territory}</p>
                      </div>

                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        {rep.achievementPct}%
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-stone-500">Achieved:</span>
                        <span className="font-bold text-stone-900">{formatKes(rep.achievedCents)}</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-stone-200">
                        <div
                          className={`h-2 rounded-full ${rep.achievementPct >= 90 ? 'bg-emerald-600' : 'bg-[#C71D1D]'}`}
                          style={{ width: `${Math.min(100, rep.achievementPct)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-right text-[10px] text-stone-400">
                        Target: {formatKes(rep.monthlyTargetCents)}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-stone-200/60 flex items-center justify-between text-[11px]">
                      <span className="text-stone-500">{rep.activeAccounts} Accounts</span>
                      <span className="font-bold text-emerald-700 font-mono">
                        +{formatKes(rep.commissionEarnedCents)} Comm.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              VIEW SECTION: 47-COUNTY REGIONAL COVERAGE & TOP SKUs
          ───────────────────────────────────────────────────────────── */}
          {(analyticsView === 'all' || analyticsView === 'territories') && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Regional Coverage Hubs (6 Clusters) */}
              <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:col-span-2">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-stone-900">
                      Regional Distribution & Territory Hub Infrastructure
                    </h3>
                    <p className="text-xs text-stone-500">
                      Wholesale retail penetration and on-time fulfilment rates across 6 regional nodes
                    </p>
                  </div>
                  <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">
                    6 Territory Hubs
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(commercialAnalytics?.regions || [
                    { county: 'Nairobi', hubs: 'WH-NBO-01', revenueCents: 215000000, activeBuyers: 48, growthPct: 24.1, cartonsShipped: 1620, onTimeFulfilmentPct: 98.4 },
                    { county: 'Mombasa & Coast', hubs: 'WH-MSA-01', revenueCents: 112000000, activeBuyers: 26, growthPct: 18.5, cartonsShipped: 840, onTimeFulfilmentPct: 95.8 },
                    { county: 'Kisumu & Western', hubs: 'WH-KSM-01', revenueCents: 74000000, activeBuyers: 19, growthPct: 29.3, cartonsShipped: 560, onTimeFulfilmentPct: 94.2 },
                    { county: 'Nakuru & Rift', hubs: 'WH-NKR-01', revenueCents: 43200000, activeBuyers: 14, growthPct: 15.2, cartonsShipped: 330, onTimeFulfilmentPct: 96.5 },
                    { county: 'Kiambu & Mt Kenya', hubs: 'WH-NBO-01 (Satellite)', revenueCents: 32000000, activeBuyers: 11, growthPct: 21.0, cartonsShipped: 240, onTimeFulfilmentPct: 97.4 },
                    { county: 'Uasin Gishu & North Rift', hubs: 'WH-ELD-01', revenueCents: 28000000, activeBuyers: 9, growthPct: 27.8, cartonsShipped: 210, onTimeFulfilmentPct: 93.8 },
                  ]).map((reg: any) => (
                    <div key={reg.county} className="rounded-xl border border-stone-100 bg-stone-50 p-3.5 transition hover:border-red-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-[#C71D1D]" />
                          <span className="text-xs font-bold text-stone-900">{reg.county}</span>
                        </div>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          +{reg.growthPct}% YoY
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-baseline justify-between">
                        <p className="text-sm font-bold text-stone-900">{formatKes(reg.revenueCents)}</p>
                        <span className="text-[11px] text-stone-500">{reg.activeBuyers} Retailers</span>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[10px] text-stone-500 pt-1.5 border-t border-stone-200/60">
                        <span>Hub: <strong className="font-mono text-stone-700">{reg.hubs}</strong></span>
                        <span className="text-emerald-700 font-semibold">{reg.onTimeFulfilmentPct || 97}% On-Time</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Selling Wholesale SKUs */}
              <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="border-b border-stone-100 pb-3">
                  <h3 className="text-base font-bold text-stone-900">Top Wholesale SKUs</h3>
                  <p className="text-xs text-stone-500">Carton velocity & demand leader</p>
                </div>

                <div className="mt-4 divide-y divide-stone-100 text-xs">
                  {(commercialAnalytics?.topSkus || [
                    { skuCode: 'SKU-SAFF-001', productName: 'Saffron Cocoa Butter Lotion 400ml', brand: 'Saffron Milan', cartonsShipped: 680, grossMarginPct: 34.2 },
                    { skuCode: 'SKU-BIOS-001', productName: 'Bio Saff Coconut Oil 250ml', brand: 'Bio Saff', cartonsShipped: 540, grossMarginPct: 29.5 },
                    { skuCode: 'SKU-CORN-001', productName: 'Cornells Cedarwood Beard Oil 50ml', brand: 'Cornells', cartonsShipped: 410, grossMarginPct: 37.8 },
                    { skuCode: 'SKU-PET-001', productName: 'PetCare Flea & Tick Shampoo 500ml', brand: 'PetCare', cartonsShipped: 310, grossMarginPct: 24.8 },
                    { skuCode: 'SKU-SAFF-002', productName: 'Saffron Shea Butter Cream 250g', brand: 'Saffron Milan', cartonsShipped: 290, grossMarginPct: 31.0 },
                  ]).map((sku: any) => (
                    <div key={sku.skuCode} className="py-2.5 flex items-center justify-between">
                      <div className="space-y-0.5 max-w-[70%]">
                        <p className="font-bold text-stone-900 truncate">{sku.productName}</p>
                        <p className="text-[10px] font-mono text-stone-400">{sku.skuCode} · {sku.brand}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-stone-900 font-mono">{sku.cartonsShipped} ctn</p>
                        <span className="text-[10px] text-emerald-700 font-semibold">{sku.grossMarginPct}% Margin</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
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

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-right mr-2">
                        <p className="text-sm font-extrabold text-[#C71D1D]">
                          {formatKes(o.totalCents)}
                        </p>
                        <p className="text-[11px] text-stone-400">
                          {o.items?.length || 0} product lines
                        </p>
                      </div>

                      {/* Tax Invoice Print */}
                      <button
                        onClick={() => {
                          const inv = invoices.find((i: any) => i.orderId === o.id) || { id: 'inv-001' };
                          handleFetchPrintInvoice(inv.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                        title="Print KRA eTIMS Tax Invoice"
                      >
                        <Printer className="h-3.5 w-3.5 text-stone-500" />
                        Tax Invoice
                      </button>

                      {/* Dispatch Action if not yet delivered */}
                      {o.status !== 'delivered' && (
                        <button
                          onClick={() => {
                            setDispatchOrderId(o.id);
                            setShowDispatchModal(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          <Truck className="h-3.5 w-3.5" />
                          Dispatch Fleet
                        </button>
                      )}

                      {/* Payment Action if pending */}
                      {o.paymentStatus !== 'paid' && (
                        <div className="flex items-center gap-1.5">
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
                          <button
                            onClick={() => {
                              const inv = invoices.find((i: any) => i.orderId === o.id) || {
                                id: `inv-${o.id}`,
                                balanceDueCents: o.totalCents,
                                invoiceNumber: `INV-${o.orderNumber}`,
                              };
                              setReconInvoiceId(inv.id);
                              setReconAmountKes(String(Math.round(inv.balanceDueCents / 100)));
                              setShowRecordReconModal(true);
                            }}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                          >
                            Bank Recon
                          </button>
                        </div>
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
          TAB: DISPATCH & MULTI-WAREHOUSE LOGISTICS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'dispatch' && (
        <div className="space-y-6">
          {/* Warehouse Distribution Network */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">Regional Warehouse Distribution Hubs</h3>
                <p className="text-xs text-stone-500">
                  Kenya-wide multi-depot stock allocation, vehicle loading, and regional fulfillment
                </p>
              </div>
              <button
                onClick={() => {
                  if (orders.length > 0) {
                    setDispatchOrderId(orders[0].id);
                  }
                  setShowDispatchModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#C71D1D] px-3 py-2 text-xs font-bold text-white shadow hover:bg-red-800"
              >
                <Truck className="h-4 w-4" />
                Dispatch New Consignment
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {warehouses.map((wh: any) => {
                const utilizationPct = Math.min(
                  100,
                  Math.round(((wh.currentStockCartons || 1000) / (wh.capacityCartons || 20000)) * 100)
                );
                return (
                  <div
                    key={wh.id}
                    className="flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50/60 p-4 transition hover:border-stone-300 hover:bg-white"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold text-[#C71D1D]">
                          {wh.code}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                          {wh.status || 'Active'}
                        </span>
                      </div>
                      <h4 className="mt-2 text-sm font-bold text-stone-900">{wh.name}</h4>
                      <p className="flex items-center gap-1 text-xs text-stone-500 mt-0.5">
                        <MapPin className="h-3 w-3 text-stone-400" />
                        {wh.city}, {wh.county}
                      </p>
                      <p className="text-[11px] text-stone-400 mt-1">{wh.address}</p>
                    </div>

                    <div className="mt-4 border-t border-stone-200/60 pt-3">
                      <div className="flex items-center justify-between text-xs text-stone-600 mb-1">
                        <span>Carton Utilization:</span>
                        <span className="font-bold text-stone-900">
                          {wh.currentStockCartons?.toLocaleString() || '18,400'} / {wh.capacityCartons?.toLocaleString() || '25,000'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-stone-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            utilizationPct > 85
                              ? 'bg-amber-500'
                              : utilizationPct > 95
                              ? 'bg-red-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${utilizationPct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-stone-500">
                        <span>Manager: {wh.managerName}</span>
                        <span>{wh.managerPhone}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Fleet Dispatches & Consignments */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">Fleet Dispatches & Consignments</h3>
                <p className="text-xs text-stone-500">
                  End-to-end driver assignment, vehicle registration, and Proof of Delivery (POD) confirmations
                </p>
              </div>
              <span className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600">
                {shipments.length} Active Movements
              </span>
            </div>

            <div className="mt-4 divide-y divide-stone-100">
              {shipments.map((s: any) => (
                <div key={s.id} className="py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-stone-900">
                          {s.consignmentNumber}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            s.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.status === 'in_transit'
                              ? 'bg-blue-100 text-blue-800'
                              : s.status === 'dispatched'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {s.status}
                        </span>
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-stone-600">
                          Hub: {s.warehouseCode}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-stone-800 font-medium">
                        Order #{s.orderNumber || s.orderId} ·{' '}
                        <span className="text-stone-500">Carrier: {s.carrierName || 'Rekker Internal Logistics'}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-stone-500">
                        <span>Driver: <strong className="text-stone-700">{s.assignedDriverName || 'Assigned Driver'}</strong></span>
                        <span>Vehicle Reg: <strong className="text-stone-700">{s.vehicleRegistration || 'KDM 482B'}</strong></span>
                        {s.deliveryNotes && <span>Notes: {s.deliveryNotes}</span>}
                      </div>
                      {s.podRecipientName && (
                        <p className="mt-1 text-[11px] text-emerald-700 font-medium">
                          POD Confirmed by: {s.podRecipientName} ({s.podConfirmedAt ? new Date(s.podConfirmedAt).toLocaleString('en-KE') : 'Verified'})
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {s.status !== 'delivered' && (
                        <button
                          onClick={() => {
                            setPodShipmentId(s.id);
                            setShowPodModal(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirm POD
                        </button>
                      )}

                      <button
                        onClick={async () => {
                          try {
                            const note = await apiGet<any>(`/api/trade/orders/${s.orderId}/delivery-note`);
                            alert(
                              `REKKER CONSIGNMENT DELIVERY NOTE\n` +
                              `----------------------------------------\n` +
                              `Note #: ${note.deliveryNoteNumber}\n` +
                              `Order #: ${note.orderNumber}\n` +
                              `Consignment: ${note.consignmentNumber}\n` +
                              `Customer: ${note.customerName}\n` +
                              `Destination: ${note.deliveryAddress}\n` +
                              `Driver: ${note.driverName} (${note.vehicleRegistration})\n` +
                              `Total Cartons: ${note.totalCartons}\n` +
                              `Dispatched: ${note.dispatchTimestamp ? new Date(note.dispatchTimestamp).toLocaleString('en-KE') : 'Today'}\n` +
                              `Sign-Off: ${note.requiresDualSignature ? 'Dual Driver & Store Receiver signatures verified' : 'Standard'}`
                            );
                          } catch (err: any) {
                            setBanner({ type: 'error', message: err.message || 'Could not fetch delivery note.' });
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                      >
                        <FileText className="h-3.5 w-3.5 text-stone-500" />
                        Delivery Note
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: PROCUREMENT DESK & RAW MATERIALS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'procurement' && (
        <div className="space-y-6">
          {/* Procurement Action Bar */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">Procurement & Raw Materials Desk</h3>
                <p className="text-xs text-stone-500">
                  Approved supplier directory, raw ingredient stock levels, and Goods Received Notes (GRN)
                </p>
              </div>
              <button
                onClick={() => {
                  if (suppliers.length > 0) {
                    setPoSupplierId(suppliers[0].id);
                  }
                  if (materials.length > 0) {
                    setPoLineItems([
                      {
                        materialId: materials[0].id,
                        quantity: 1000,
                        unitPriceCents: materials[0].unitCostCents || 45000,
                      },
                    ]);
                  }
                  setShowNewPoModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#C71D1D] px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-red-800"
              >
                <Plus className="h-4 w-4" />
                Issue Supplier Purchase Order
              </button>
            </div>

            {/* Raw Materials Inventory Matrix */}
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                Factory Raw Materials & Component Inventory
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {materials.map((mat: any) => {
                  const isCritical = mat.status === 'critical';
                  const isLow = mat.status === 'low_stock';
                  return (
                    <div
                      key={mat.id}
                      className={`rounded-xl border p-4 transition ${
                        isCritical
                          ? 'border-red-300 bg-red-50/40'
                          : isLow
                          ? 'border-amber-300 bg-amber-50/40'
                          : 'border-stone-200 bg-stone-50/50 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold text-stone-600">
                          {mat.skuCode}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            isCritical
                              ? 'bg-red-100 text-red-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {mat.status === 'low_stock' ? 'Low Stock' : mat.status}
                        </span>
                      </div>
                      <h5 className="mt-2 text-sm font-bold text-stone-900">{mat.name}</h5>
                      <p className="text-xs text-stone-500 capitalize">{mat.category}</p>

                      <div className="mt-3 flex items-center justify-between border-t border-stone-200/60 pt-2 text-xs">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-stone-400">On Hand</p>
                          <p className="font-mono font-bold text-stone-900">
                            {mat.currentStock?.toLocaleString()} {mat.unitOfMeasure}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-stone-400">Reorder Level</p>
                          <p className="font-mono text-stone-600">
                            {mat.reorderPoint?.toLocaleString()} {mat.unitOfMeasure}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-stone-400">Unit Cost</p>
                          <p className="font-mono text-stone-700">{formatKes(mat.unitCostCents)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Approved Suppliers Directory */}
            <div className="mt-8">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                Approved Raw Material Suppliers
              </h4>
              <div className="overflow-x-auto rounded-xl border border-stone-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 text-stone-700 border-b border-stone-200 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Code / Name</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">KRA PIN</th>
                      <th className="p-3">Credit Terms</th>
                      <th className="p-3">Lead Time</th>
                      <th className="p-3">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {suppliers.map((sup: any) => (
                      <tr key={sup.id} className="hover:bg-stone-50/60">
                        <td className="p-3 font-medium text-stone-900">
                          <span className="font-mono text-stone-500 mr-2">{sup.code}</span>
                          <strong>{sup.name}</strong>
                        </td>
                        <td className="p-3 text-stone-600 capitalize">{sup.category}</td>
                        <td className="p-3 font-mono text-stone-600">{sup.kraPin}</td>
                        <td className="p-3 font-semibold uppercase text-stone-700">
                          {sup.paymentTerms}
                        </td>
                        <td className="p-3 text-stone-600">{sup.leadTimeDays} days</td>
                        <td className="p-3 text-stone-500">
                          {sup.contactPerson} · {sup.email}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Purchase Orders Stream */}
            <div className="mt-8">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                Supplier Purchase Orders & GRN Stream
              </h4>
              <div className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {procurementOrders.map((po: any) => (
                  <div key={po.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-stone-900">{po.poNumber}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            po.status === 'received'
                              ? 'bg-emerald-100 text-emerald-800'
                              : po.status === 'issued'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {po.status}
                        </span>
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">
                          Dest: {po.warehouseCode}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-stone-800">
                        Supplier: {po.supplierName}
                      </p>
                      <p className="text-[11px] text-stone-400">
                        Expected Delivery: {new Date(po.expectedDeliveryDate).toLocaleDateString('en-KE')} · Line items: {po.items?.length || 1}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-[#C71D1D]">
                          {formatKes(po.totalCostCents)}
                        </p>
                        <p className="text-[11px] text-stone-400">Net Cost Ex-Works</p>
                      </div>

                      {po.status === 'issued' && (
                        <button
                          onClick={() => handleReceivePo(po.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          Receive Goods (GRN)
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs font-bold text-stone-800">
                        Credit Limit: KES {b.creditLimitKes?.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        Terms: {b.creditTerms} · Tier Discount: {b.tierDiscountPct}%
                      </p>
                    </div>

                    <button
                      onClick={() => handleOpenStatement(b.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 shadow-sm hover:border-[#C71D1D] hover:text-[#C71D1D]"
                    >
                      <FileText className="h-3.5 w-3.5 text-stone-400" />
                      Statement & Aging
                    </button>

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
          TAB: TREASURY & BANK RECONCILIATIONS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'reconciliations' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Treasury & Bank Payment Reconciliations
                </h3>
                <p className="text-xs text-stone-500">
                  Direct bank settlements (RTGS, EFT, Paybill) reconciled against wholesale tax invoices with audit trail
                </p>
              </div>
              <button
                onClick={() => {
                  setReconInvoiceId(invoices[0]?.id || '');
                  setReconAmountKes(String(Math.round((invoices[0]?.balanceDueCents || 0) / 100)));
                  setShowRecordReconModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#C71D1D] px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-red-800"
              >
                <Plus className="h-4 w-4" />
                Record Bank Payment
              </button>
            </div>

            {/* Metrics Row */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-stone-100 bg-stone-50 p-4">
                <span className="text-[11px] font-bold uppercase text-stone-500">Reconciliations Recorded</span>
                <p className="mt-1 text-2xl font-bold text-stone-900">{reconciliations.length}</p>
                <p className="mt-1 text-[11px] text-emerald-700">100% matched to invoice ledger</p>
              </div>
              <div className="rounded-xl border border-stone-100 bg-stone-50 p-4">
                <span className="text-[11px] font-bold uppercase text-stone-500">Total Settled via RTGS / Bank</span>
                <p className="mt-1 text-2xl font-bold text-stone-900">
                  {formatKes(reconciliations.reduce((sum: number, r: any) => sum + (r.amountCents || 0), 0))}
                </p>
                <p className="mt-1 text-[11px] text-stone-500">Stanbic & KCB commercial accounts</p>
              </div>
              <div className="rounded-xl border border-stone-100 bg-stone-50 p-4">
                <span className="text-[11px] font-bold uppercase text-stone-500">Reconciliation Verification</span>
                <div className="mt-1 flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm font-bold text-stone-800">Finance Treasury Analyst</span>
                </div>
                <p className="mt-1 text-[11px] text-stone-500">Immutable Maker-Checker compliance</p>
              </div>
            </div>

            {/* Table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="pb-3 font-semibold">Payment Ref & Method</th>
                    <th className="pb-3 font-semibold">Target Invoice</th>
                    <th className="pb-3 font-semibold">Customer Account</th>
                    <th className="pb-3 font-semibold">Settlement Bank</th>
                    <th className="pb-3 font-semibold text-right">Amount (KES)</th>
                    <th className="pb-3 font-semibold text-center">Status</th>
                    <th className="pb-3 font-semibold">Reconciled At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {reconciliations.map((r: any) => (
                    <tr key={r.id} className="hover:bg-stone-50 transition-colors">
                      <td className="py-3">
                        <div className="font-mono font-bold text-stone-900">{r.referenceNumber}</div>
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-stone-600">
                          {r.paymentMethod?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 font-mono font-bold text-[#C71D1D]">{r.invoiceNumber}</td>
                      <td className="py-3 font-medium text-stone-800">{r.businessName}</td>
                      <td className="py-3 text-stone-600">{r.bankName}</td>
                      <td className="py-3 text-right font-mono font-bold text-stone-900">
                        {formatKes(r.amountCents)}
                      </td>
                      <td className="py-3 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                          <Check className="h-3 w-3" />
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 text-stone-500">
                        {new Date(r.reconciledAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
                      </td>
                    </tr>
                  ))}
                  {reconciliations.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-stone-400">
                        No bank reconciliations recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: FIELD CRM & SALES REPS DIRECTORY
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'crm' && (
        <div className="space-y-6">
          {/* Top Card */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Field Sales CRM & Customer Visit Logs
                </h3>
                <p className="text-xs text-stone-500">
                  Territory sales representatives, monthly quota pacing, and on-site buyer interaction journals
                </p>
              </div>
              <button
                onClick={() => {
                  setInteractionBizId(businesses[0]?.id || 'biz-001');
                  setInteractionSalesRepId(salesReps[0]?.id || 'rep-001');
                  setInteractionSummary('');
                  setShowLogInteractionModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#C71D1D] px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-red-800"
              >
                <Plus className="h-4 w-4" />
                Log Customer Visit
              </button>
            </div>

            {/* Sales Rep Quotas */}
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                Sales Representatives & Territory Quotas
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {salesReps.map((rep: any) => {
                  const pct = Math.min(100, Math.round((rep.achievedCents / rep.monthlyTargetCents) * 100));
                  return (
                    <div key={rep.id} className="rounded-xl border border-stone-100 bg-stone-50 p-4 transition hover:border-red-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-900">{rep.name}</span>
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-[#C71D1D]">
                          {rep.commissionRatePct}% Comm.
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-stone-400" />
                        {rep.territoryCounty}
                      </p>

                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-stone-500">MTD Pacing:</span>
                          <span className="font-bold text-stone-900">{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-2 w-full rounded-full bg-stone-200">
                          <div
                            className={`h-2 rounded-full ${pct >= 80 ? 'bg-emerald-600' : 'bg-[#C71D1D]'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-2 flex justify-between text-[11px] text-stone-500">
                          <span>{formatKes(rep.achievedCents)}</span>
                          <span className="text-stone-400">/ {formatKes(rep.monthlyTargetCents)}</span>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-stone-200/60 flex justify-between text-[11px] text-stone-500">
                        <span>{rep.activeAccountsCount} Accounts</span>
                        <span className="font-mono">{rep.phone}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Field Visit Logs */}
            <div className="mt-8">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Recent Field Interaction Journals ({interactions.length})
                </h4>
              </div>

              <div className="mt-4 divide-y divide-stone-100">
                {interactions.map((it: any) => (
                  <div key={it.id} className="py-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-stone-900">{it.businessName}</span>
                        <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                          {it.interactionType?.replace('_', ' ')}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            it.outcome === 'order_secured'
                              ? 'bg-emerald-100 text-emerald-800'
                              : it.outcome === 'positive'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {it.outcome?.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-stone-700">{it.summary}</p>
                      <div className="flex items-center gap-3 text-[11px] text-stone-500 pt-1">
                        <span>Rep: <strong className="text-stone-700">{it.salesRepName}</strong></span>
                        <span>·</span>
                        <span>Next Follow-up: <strong className="text-stone-700">{it.nextFollowUpDate}</strong></span>
                      </div>
                    </div>

                    <div className="text-right text-[11px] text-stone-400 whitespace-nowrap">
                      {new Date(it.createdAt).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' })}
                    </div>
                  </div>
                ))}
                {interactions.length === 0 && (
                  <div className="py-8 text-center text-stone-400 text-xs">
                    No field interactions logged yet.
                  </div>
                )}
              </div>
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

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: DISPATCH ORDER ALLOCATION
      ───────────────────────────────────────────────────────────── */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-red-100 p-2 text-[#C71D1D]">
                  <Truck className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Fleet Dispatch Allocation</h3>
                  <p className="text-[11px] text-stone-500">Assign warehouse origin, driver, and vehicle</p>
                </div>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleDispatchOrder} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700">Order to Dispatch</label>
                <select
                  value={dispatchOrderId}
                  onChange={(e) => setDispatchOrderId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-mono outline-none focus:border-red-500 focus:bg-white"
                >
                  <option value="">-- Select Order --</option>
                  {orders.map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} - {o.businessName} ({formatKes(o.totalCents)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-stone-700">Origin Warehouse Hub</label>
                  <select
                    value={dispatchWarehouse}
                    onChange={(e) => setDispatchWarehouse(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  >
                    {warehouses.map((wh: any) => (
                      <option key={wh.id} value={wh.code}>
                        {wh.code} - {wh.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700">Vehicle Registration</label>
                  <input
                    type="text"
                    value={dispatchVehicle}
                    onChange={(e) => setDispatchVehicle(e.target.value)}
                    placeholder="e.g. KDM 482B"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-mono outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Assigned Driver Name</label>
                <input
                  type="text"
                  value={dispatchDriver}
                  onChange={(e) => setDispatchDriver(e.target.value)}
                  placeholder="e.g. John Mwangi (Rekker Fleet)"
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Consignment Dispatch Notes</label>
                <textarea
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Fragile glass bottles, deliver to bay 3 receiver"
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-xl bg-[#C71D1D] px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-800 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Generate Consignment & Dispatch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 4: PROOF OF DELIVERY (POD) CONFIRMATION
      ───────────────────────────────────────────────────────────── */}
      {showPodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Proof of Delivery (POD)</h3>
                  <p className="text-[11px] text-stone-500">Record recipient confirmation</p>
                </div>
              </div>
              <button
                onClick={() => setShowPodModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmPod} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700">Recipient / Receiving Manager</label>
                <input
                  type="text"
                  value={podRecipient}
                  onChange={(e) => setPodRecipient(e.target.value)}
                  placeholder="e.g. Grace Auma (Store Operations Mgr)"
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-emerald-800">
                <p className="font-semibold">Statutory Delivery Acknowledgement</p>
                <p className="mt-0.5 text-[11px] text-emerald-700">
                  Recording POD marks this consignment as fulfilled in ERP and triggers automatic invoice clearance if paid.
                </p>
              </div>

              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPodModal(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Sign Off Delivery
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 5: ISSUE PURCHASE ORDER TO SUPPLIER
      ───────────────────────────────────────────────────────────── */}
      {showNewPoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-stone-900 p-2 text-white">
                  <Plus className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Issue Raw Materials Purchase Order</h3>
                  <p className="text-[11px] text-stone-500">Contracted supplier requisition</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewPoModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePo} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-stone-700">Contracted Supplier</label>
                  <select
                    value={poSupplierId}
                    onChange={(e) => setPoSupplierId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  >
                    {suppliers.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700">Destination Hub</label>
                  <select
                    value={poWarehouseCode}
                    onChange={(e) => setPoWarehouseCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  >
                    {warehouses.map((wh: any) => (
                      <option key={wh.id} value={wh.code}>
                        {wh.code} - {wh.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Raw Material Requirement</label>
                <div className="mt-1 space-y-2">
                  {poLineItems.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={line.materialId}
                        onChange={(e) => {
                          const mat = materials.find((m: any) => m.id === e.target.value);
                          const next = [...poLineItems];
                          next[idx] = {
                            ...next[idx],
                            materialId: e.target.value,
                            unitPriceCents: mat?.unitCostCents || 45000,
                          };
                          setPoLineItems(next);
                        }}
                        className="flex-1 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                      >
                        <option value="">-- Select Ingredient / Packaging --</option>
                        {materials.map((m: any) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.skuCode}) - {formatKes(m.unitCostCents)}/{m.unitOfMeasure}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        value={line.quantity || ''}
                        onChange={(e) => {
                          const next = [...poLineItems];
                          next[idx] = { ...next[idx], quantity: parseInt(e.target.value) || 0 };
                          setPoLineItems(next);
                        }}
                        placeholder="Quantity"
                        className="w-28 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-mono outline-none focus:border-red-500 focus:bg-white"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Expected Delivery Date</label>
                <input
                  type="date"
                  value={poExpectedDate}
                  onChange={(e) => setPoExpectedDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewPoModal(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-xl bg-[#C71D1D] px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-800 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Issue Official Requisition PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: DEBTOR STATEMENT OF ACCOUNT & AGING ANALYSIS
      ───────────────────────────────────────────────────────────── */}
      {showStatementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl my-8 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-stone-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-red-100 p-2 text-[#C71D1D]">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-stone-900">
                      Debtor Statement of Account
                    </h3>
                    <p className="text-xs text-stone-500">
                      Formal statement with statutory aging schedule and settlement ledger
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-600">
                  <span className="font-bold text-stone-900">
                    {statement?.business?.legalName || 'Valued Customer'}
                  </span>
                  <span>·</span>
                  <span>KRA PIN: <strong className="font-mono">{statement?.business?.kraPin || 'N/A'}</strong></span>
                  <span>·</span>
                  <span>Contact: {statement?.business?.primaryContact}</span>
                  <span>·</span>
                  <span>Terms: <strong className="uppercase">{statement?.business?.creditTerms}</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                    statement?.business?.creditHealth === 'healthy'
                      ? 'bg-emerald-100 text-emerald-800'
                      : statement?.business?.creditHealth === 'warning'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {statement?.business?.creditHealth === 'healthy'
                    ? 'Healthy Credit'
                    : statement?.business?.creditHealth === 'warning'
                    ? 'Credit Warning'
                    : 'Credit Hold'}
                </span>
                <button
                  onClick={() => setShowStatementModal(false)}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Aging Summary Buckets */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                Accounts Receivable Aging Analysis (KES)
              </h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-stone-500">0 - 30 Days (Current)</span>
                  <p className="mt-1 font-mono text-sm font-bold text-stone-900">
                    {formatKes(statement?.agingSummary?.current0To30Cents || 0)}
                  </p>
                  <span className="text-[10px] text-emerald-600 font-semibold">Standard Terms</span>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-stone-500">31 - 60 Days</span>
                  <p className="mt-1 font-mono text-sm font-bold text-stone-900">
                    {formatKes(statement?.agingSummary?.overdue31To60Cents || 0)}
                  </p>
                  <span className="text-[10px] text-amber-600 font-semibold">Follow-up Due</span>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-stone-500">61 - 90 Days</span>
                  <p className="mt-1 font-mono text-sm font-bold text-stone-900">
                    {formatKes(statement?.agingSummary?.overdue61To90Cents || 0)}
                  </p>
                  <span className="text-[10px] text-red-600 font-semibold">Escalated</span>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-stone-500">90+ Days (Default)</span>
                  <p className="mt-1 font-mono text-sm font-bold text-stone-900">
                    {formatKes(statement?.agingSummary?.overdue90PlusCents || 0)}
                  </p>
                  <span className="text-[10px] text-red-700 font-semibold">Critical Overdue</span>
                </div>

                <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
                  <span className="text-[10px] font-bold uppercase text-[#C71D1D]">Total Outstanding</span>
                  <p className="mt-1 font-mono text-sm font-extrabold text-[#C71D1D]">
                    {formatKes(statement?.agingSummary?.totalOutstandingCents || 0)}
                  </p>
                  <span className="text-[10px] text-stone-500">
                    Limit: {formatKes(statement?.business?.creditLimitCents || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Chronological Statement Ledger */}
            <div>
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Running Transaction Ledger ({statement?.ledger?.length || 0} Entries)
                </h4>
                <span className="text-[11px] text-stone-400">Amounts in Kenya Shillings</span>
              </div>

              <div className="mt-3 max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="pb-2 font-semibold">Date</th>
                      <th className="pb-2 font-semibold">Type</th>
                      <th className="pb-2 font-semibold">Reference</th>
                      <th className="pb-2 font-semibold">Description</th>
                      <th className="pb-2 font-semibold text-right">Debit</th>
                      <th className="pb-2 font-semibold text-right">Credit</th>
                      <th className="pb-2 font-semibold text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-mono">
                    {statement?.ledger?.map((entry: any, idx: number) => (
                      <tr key={idx} className="hover:bg-stone-50">
                        <td className="py-2.5 text-stone-500 text-[11px]">{entry.date?.slice(0, 10)}</td>
                        <td className="py-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase font-sans ${
                              entry.type === 'INVOICE'
                                ? 'bg-red-50 text-[#C71D1D]'
                                : 'bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            {entry.type}
                          </span>
                        </td>
                        <td className="py-2.5 font-bold text-stone-900">{entry.reference}</td>
                        <td className="py-2.5 font-sans text-stone-600 text-[11px]">{entry.description}</td>
                        <td className="py-2.5 text-right font-medium text-stone-900">
                          {entry.debitCents > 0 ? formatKes(entry.debitCents) : '-'}
                        </td>
                        <td className="py-2.5 text-right font-medium text-emerald-700">
                          {entry.creditCents > 0 ? formatKes(entry.creditCents) : '-'}
                        </td>
                        <td className="py-2.5 text-right font-bold text-stone-900">
                          {formatKes(entry.balanceCents)}
                        </td>
                      </tr>
                    ))}
                    {(!statement?.ledger || statement.ledger.length === 0) && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-stone-400 font-sans">
                          No transactions found on this account.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Settlement Banking & Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-stone-200 pt-4">
              <div className="rounded-xl border border-stone-100 bg-stone-50 p-3 text-[11px] text-stone-600 sm:max-w-md">
                <p className="font-bold text-stone-800 uppercase text-[10px]">Settlement Remittance Details</p>
                <p className="mt-0.5">
                  Bank: <strong>{statement?.sellerBanking?.bankName}</strong> · Acc: <strong className="font-mono">{statement?.sellerBanking?.accountNumber}</strong>
                </p>
                <p className="mt-0.5 text-emerald-700">
                  M-Pesa Business Paybill: <strong>{statement?.sellerBanking?.mpesaPaybill}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 shadow-sm hover:bg-stone-50"
                >
                  <Printer className="h-4 w-4" />
                  Print Statement
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowStatementModal(false);
                    const matchingInv = invoices.find((i: any) => i.businessId === selectedStatementBusinessId && i.balanceDueCents > 0) || invoices[0];
                    if (matchingInv) {
                      setReconInvoiceId(matchingInv.id);
                      setReconAmountKes(String(Math.round(matchingInv.balanceDueCents / 100)));
                    }
                    setShowRecordReconModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#C71D1D] px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-red-800"
                >
                  <CreditCard className="h-4 w-4" />
                  Record Bank Settlement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: RECORD BANK PAYMENT RECONCILIATION
      ───────────────────────────────────────────────────────────── */}
      {showRecordReconModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-red-100 p-2 text-[#C71D1D]">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    Record Bank Reconciliation
                  </h3>
                  <p className="text-xs text-stone-500">
                    Verify RTGS, EFT or Paybill deposit against outstanding wholesale invoice
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRecordReconModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRecordReconciliation} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700">Target Tax Invoice</label>
                <select
                  value={reconInvoiceId}
                  onChange={(e) => {
                    setReconInvoiceId(e.target.value);
                    const target = invoices.find((i: any) => i.id === e.target.value);
                    if (target) {
                      setReconAmountKes(String(Math.round(target.balanceDueCents / 100)));
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-mono outline-none focus:border-red-500 focus:bg-white"
                >
                  <option value="">-- Select Invoice to Reconcile --</option>
                  {invoices.map((inv: any) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} - {inv.businessName} (Due: {formatKes(inv.balanceDueCents)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-stone-700">Settlement Method</label>
                  <select
                    value={reconPaymentMethod}
                    onChange={(e: any) => setReconPaymentMethod(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  >
                    <option value="rtgs_eft">RTGS / EFT Bank Transfer</option>
                    <option value="mpesa_paybill">M-Pesa Business Paybill (522522)</option>
                    <option value="direct_deposit">Direct Cash / Branch Deposit</option>
                    <option value="cheque">Banker’s / Corporate Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700">Receiving Bank</label>
                  <select
                    value={reconBankName}
                    onChange={(e) => setReconBankName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  >
                    <option value="Stanbic Bank Kenya">Stanbic Bank Kenya (Main Commercial)</option>
                    <option value="KCB Bank Kenya">KCB Bank Kenya</option>
                    <option value="Equity Bank Kenya">Equity Bank Kenya</option>
                    <option value="NCBA Bank Kenya">NCBA Bank Kenya</option>
                    <option value="Co-operative Bank">Co-operative Bank of Kenya</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-stone-700">Transaction Reference Number</label>
                  <input
                    type="text"
                    required
                    value={reconRefNumber}
                    onChange={(e) => setReconRefNumber(e.target.value)}
                    placeholder="e.g. RTGS-2026-99182 / FT260481"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-mono outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700">Amount to Settle (KES)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={reconAmountKes}
                    onChange={(e) => setReconAmountKes(e.target.value)}
                    placeholder="Amount in KES"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-mono font-bold outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-800">
                <p className="font-semibold">Maker-Checker Treasury Control</p>
                <p className="mt-0.5 text-[11px] text-blue-700">
                  Submitting will credit the buyer’s ledger, decrement the invoice balance, and generate an audited reconciliation event.
                </p>
              </div>

              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRecordReconModal(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-xl bg-[#C71D1D] px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-800 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Verify & Clear Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: LOG FIELD SALES CUSTOMER VISIT
      ───────────────────────────────────────────────────────────── */}
      {showLogInteractionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-red-100 p-2 text-[#C71D1D]">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    Log Customer Field Interaction
                  </h3>
                  <p className="text-xs text-stone-500">
                    Capture territory visit notes, reorder intent, and trade credit health
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLogInteractionModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleLogInteraction} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-stone-700">Customer Account</label>
                  <select
                    value={interactionBizId}
                    onChange={(e) => setInteractionBizId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  >
                    {businesses.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.legalName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700">Sales Representative</label>
                  <select
                    value={interactionSalesRepId}
                    onChange={(e) => setInteractionSalesRepId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  >
                    {salesReps.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.territoryCounty})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-stone-700">Interaction Type</label>
                  <select
                    value={interactionType}
                    onChange={(e: any) => setInteractionType(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  >
                    <option value="site_visit">On-site Retailer Store Visit</option>
                    <option value="order_followup">Wholesale Reorder Follow-up</option>
                    <option value="debt_collection">Debtor Collection & Recon</option>
                    <option value="complaint_resolution">Complaint / Returns Resolution</option>
                    <option value="product_demo">New SKU Sampling & Demo</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700">Visit Outcome</label>
                  <select
                    value={interactionOutcome}
                    onChange={(e: any) => setInteractionOutcome(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                  >
                    <option value="positive">Positive / Account Healthy</option>
                    <option value="order_secured">Immediate Bulk Order Placed</option>
                    <option value="pending_decision">Pending Procurement Decision</option>
                    <option value="followup_required">Action Required / Overdue</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Field Notes & Commercial Summary</label>
                <textarea
                  required
                  rows={3}
                  value={interactionSummary}
                  onChange={(e) => setInteractionSummary(e.target.value)}
                  placeholder="e.g. Conducted stock audit at Nairobi West branch. Shelf velocity high on Saffron Milan lotion. Customer confirmed 50 carton reorder for month-end."
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Next Planned Follow-up</label>
                <input
                  type="date"
                  value={interactionFollowUpDate}
                  onChange={(e) => setInteractionFollowUpDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-mono outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLogInteractionModal(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-xl bg-[#C71D1D] px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-800 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Log Field Visit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 6: PRINTABLE KRA eTIMS TAX INVOICE
      ───────────────────────────────────────────────────────────── */}
      {printInvoiceData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-8 shadow-2xl my-8">
            {/* Action Bar */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-4">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-red-100 p-2 text-[#C71D1D]">
                  <Printer className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    KRA eTIMS Commercial Tax Invoice
                  </h3>
                  <p className="font-mono text-xs text-stone-500">
                    Control Code: {printInvoiceData.taxAuthority?.etimsControlCode}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-stone-800"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Document
                </button>
                <button
                  onClick={() => setPrintInvoiceData(null)}
                  className="rounded-xl border border-stone-200 p-2 text-stone-400 hover:text-stone-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Invoice Document Body */}
            <div className="mt-6 space-y-6 text-xs text-stone-800">
              {/* Header Grid */}
              <div className="flex justify-between border-b border-stone-100 pb-6">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight text-[#C71D1D]">
                    {printInvoiceData.seller?.legalName || 'REKKER LIMITED'}
                  </h2>
                  <p className="font-medium text-stone-600">{printInvoiceData.seller?.tradingName}</p>
                  <p className="text-stone-500">{printInvoiceData.seller?.physicalAddress}</p>
                  <p className="mt-1 font-mono text-[11px] text-stone-700">
                    KRA PIN: <strong>{printInvoiceData.seller?.kraPin}</strong> · VAT Reg: {printInvoiceData.seller?.vatRegistrationNumber}
                  </p>
                  <p className="text-stone-500">{printInvoiceData.seller?.email} · {printInvoiceData.seller?.phone}</p>
                </div>

                <div className="text-right">
                  <span className="inline-block rounded-md bg-stone-900 px-3 py-1 font-mono text-xs font-bold uppercase text-white">
                    TAX INVOICE
                  </span>
                  <p className="mt-2 font-mono font-bold text-stone-900 text-sm">
                    {printInvoiceData.invoiceNumber}
                  </p>
                  <p className="text-stone-500">Date: {new Date(printInvoiceData.issueDate).toLocaleDateString('en-KE')}</p>
                  <p className="text-stone-500">Due: {new Date(printInvoiceData.dueDate).toLocaleDateString('en-KE')}</p>
                  <p className="font-semibold text-stone-700 uppercase mt-1">Terms: {printInvoiceData.paymentTerms}</p>
                </div>
              </div>

              {/* Bill To & Ship To */}
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-stone-100 bg-stone-50/70 p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Bill To Customer</p>
                  <p className="mt-1 font-bold text-stone-900">{printInvoiceData.buyer?.legalName}</p>
                  <p className="text-stone-600 font-mono text-[11px]">KRA PIN: {printInvoiceData.buyer?.kraPin}</p>
                  <p className="text-stone-500">{printInvoiceData.buyer?.contactPerson}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Consignment Destination</p>
                  <p className="mt-1 text-stone-700">{printInvoiceData.buyer?.deliveryAddress}</p>
                  <p className="text-stone-500 text-[11px]">Dispatch Hub: {printInvoiceData.buyer?.branchName}</p>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-stone-200 font-bold uppercase tracking-wider text-[10px] text-stone-500">
                    <tr>
                      <th className="py-2">Item Description</th>
                      <th className="py-2 text-right">Cartons</th>
                      <th className="py-2 text-right">Unit Price</th>
                      <th className="py-2 text-right">Gross</th>
                      <th className="py-2 text-right">Discount</th>
                      <th className="py-2 text-right">16% VAT</th>
                      <th className="py-2 text-right">Total (KES)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-mono text-xs">
                    {printInvoiceData.lineItems?.map((li: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-2 font-sans font-medium text-stone-900">{li.productName}</td>
                        <td className="py-2 text-right">{li.quantityCartons}</td>
                        <td className="py-2 text-right">{formatKes(li.unitPriceCents)}</td>
                        <td className="py-2 text-right">{formatKes(li.grossAmountCents)}</td>
                        <td className="py-2 text-right text-emerald-700">-{formatKes(li.discountAmountCents)}</td>
                        <td className="py-2 text-right">{formatKes(li.taxAmountCents)}</td>
                        <td className="py-2 text-right font-bold text-stone-900">{formatKes(li.netAmountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="flex justify-end border-t border-stone-200 pt-4">
                <div className="w-72 space-y-2 font-mono text-xs">
                  <div className="flex justify-between text-stone-600">
                    <span className="font-sans">Subtotal (Ex-VAT):</span>
                    <span>{formatKes(printInvoiceData.financials?.subtotalCents)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span className="font-sans">Discount:</span>
                    <span>-{formatKes(printInvoiceData.financials?.discountCents)}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span className="font-sans">VAT (16% Kenya):</span>
                    <span>+{formatKes(printInvoiceData.financials?.vatCents)}</span>
                  </div>
                  <div className="flex justify-between border-t border-stone-200 pt-2 text-sm font-extrabold text-[#C71D1D]">
                    <span className="font-sans">Total Due:</span>
                    <span>{formatKes(printInvoiceData.financials?.totalCents)}</span>
                  </div>
                </div>
              </div>

              {/* Settlement Banking & Statutory Declaration */}
              <div className="grid grid-cols-2 gap-4 border-t border-stone-200 pt-4 text-[11px] text-stone-600">
                <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <p className="font-bold text-stone-800 uppercase text-[10px]">Settlement Banking Details</p>
                  <p className="mt-1 font-semibold">{printInvoiceData.paymentDetails?.bankName}</p>
                  <p className="font-mono">Account: {printInvoiceData.paymentDetails?.accountNumber}</p>
                  <p className="font-mono">Branch / Sort: {printInvoiceData.paymentDetails?.branch} ({printInvoiceData.paymentDetails?.swiftCode})</p>
                  <p className="font-mono mt-1 text-emerald-700">
                    M-Pesa Paybill: <strong>{printInvoiceData.paymentDetails?.mpesaPaybill}</strong> (Acc: {printInvoiceData.invoiceNumber})
                  </p>
                </div>

                <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <p className="font-bold text-stone-800 uppercase text-[10px]">eTIMS Compliance Verification</p>
                  <p className="mt-1 font-mono text-[10px] break-all text-stone-600">
                    QR: {printInvoiceData.taxAuthority?.qrCodeUrl}
                  </p>
                  <p className="mt-2 text-[10px] text-stone-400">
                    This is an authoritative electronic tax invoice issued pursuant to the Kenya Tax Procedures Act and VAT Act 2013 regulations.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TradePage;
