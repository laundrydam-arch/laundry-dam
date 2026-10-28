import React, { useState } from "react";
import { 
  Plus, 
  Search, 
  Printer, 
  Share2, 
  Trash2, 
  Check, 
  FileText, 
  DollarSign, 
  User, 
  Phone, 
  Weight, 
  Calendar, 
  Clock, 
  Eye, 
  ChevronRight,
  Sparkles,
  Smartphone,
  CheckCircle,
  X,
  CreditCard,
  UserPlus
} from "lucide-react";
import { LaundryTransaction, Customer, Service } from "../types";

interface LaundryTransactionsProps {
  transactions: LaundryTransaction[];
  customers: Customer[];
  services: Service[];
  activeOwnerId: string | null;
  onAddTransaction: (trx: LaundryTransaction) => Promise<void>;
  onUpdateTransaction: (id: string, updates: Partial<LaundryTransaction>) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onAddCustomer: (cust: Customer) => Promise<void>;
  onAddService: (item: Service) => Promise<void>;
  showCreateModalDirectly?: boolean;
  onCloseCreateModalDirectly?: () => void;
  showCustomerModalDirectly?: boolean;
  onCloseCustomerModalDirectly?: () => void;
  showServiceModalDirectly?: boolean;
  onCloseServiceModalDirectly?: () => void;
  triggerConfirm: (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    isDangerous?: boolean
  ) => void;
}

export function LaundryTransactions({
  transactions,
  customers,
  services,
  activeOwnerId,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onAddCustomer,
  onAddService,
  showCreateModalDirectly = false,
  onCloseCreateModalDirectly,
  showCustomerModalDirectly = false,
  onCloseCustomerModalDirectly,
  showServiceModalDirectly = false,
  onCloseServiceModalDirectly,
  triggerConfirm
}: LaundryTransactionsProps) {
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("Semua");

  // Flow dialogues:
  const [isCreatingTrx, setIsCreatingTrx] = useState<boolean>(showCreateModalDirectly);
  const [isCreatingCust, setIsCreatingCust] = useState<boolean>(showCustomerModalDirectly);
  const [isCreatingServ, setIsCreatingServ] = useState<boolean>(showServiceModalDirectly);

  // active invoice printing simulation:
  const [printingTrx, setPrintingTrx] = useState<LaundryTransaction | null>(null);
  const [printingProgress, setPrintingProgress] = useState<number>(0);
  const [isPrintFinished, setIsPrintFinished] = useState<boolean>(false);

  // New Transaction Form state
  const [selectedCustId, setSelectedCustId] = useState<string>("");
  const [customCustName, setCustomCustName] = useState<string>("");
  const [customCustPhone, setCustomCustPhone] = useState<string>("");
  const [createCustInline, setCreateCustInline] = useState<boolean>(false);

  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [trxWeight, setTrxWeight] = useState<number>(1);
  const [selectedParfum, setSelectedParfum] = useState<string>("Lavender");
  const [trxNotes, setTrxNotes] = useState<string>("");
  const [statusBayar, setStatusBayar] = useState<"Lunas" | "Belum Lunas">("Belum Lunas");
  const [paymentMethod, setPaymentMethod] = useState<"Tunai" | "QRIS" | "Transfer">("Tunai");

  // New Customer Form state
  const [newCustName, setNewCustName] = useState<string>("");
  const [newCustPhone, setNewCustPhone] = useState<string>("");
  const [newCustAddress, setNewCustAddress] = useState<string>("");

  // New Service Form state
  const [newServName, setNewServName] = useState<string>("");
  const [newServType, setNewServType] = useState<"Kiloan" | "Satuan" | "Meter">("Kiloan");
  const [newServPrice, setNewServPrice] = useState<number>(0);
  const [newServDuration, setNewServDuration] = useState<number>(48);

  React.useEffect(() => {
    if (showCreateModalDirectly) setIsCreatingTrx(true);
  }, [showCreateModalDirectly]);

  React.useEffect(() => {
    if (showCustomerModalDirectly) setIsCreatingCust(true);
  }, [showCustomerModalDirectly]);

  React.useEffect(() => {
    if (showServiceModalDirectly) setIsCreatingServ(true);
  }, [showServiceModalDirectly]);

  // Handler: Calculate values block
  const currentService = services.find(s => s.id === selectedServiceId);
  const calculatedTotal = currentService ? currentService.harga * trxWeight : 0;

  // Filter list
  const filteredTrx = transactions.filter((t) => {
    const matchesSearch = 
      t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.layananNama.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === "Semua") return matchesSearch;
    return matchesSearch && t.status === statusFilter;
  });

  // Actions trigger list:
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOwnerId) {
      alert("Database error: Silakan login terlebih dahulu.");
      return;
    }

    let resolvedCustName = "";
    let resolvedCustPhone = "";

    if (createCustInline) {
      if (!customCustName || !customCustPhone) {
        alert("Nama Pelanggan dan No HP wajib diisi.");
        return;
      }
      
      const newCustId = "CUST-" + Date.now().toString().slice(-6);
      const newCust: Customer = {
        id: newCustId,
        nama: customCustName,
        telepon: customCustPhone,
        userId: activeOwnerId,
        createdAt: new Date().toISOString()
      };
      
      await onAddCustomer(newCust);
      resolvedCustName = customCustName;
      resolvedCustPhone = customCustPhone;
    } else {
      const selected = customers.find(c => c.id === selectedCustId);
      if (!selected) {
        alert("Pilih pelanggan terlebih dahulu.");
        return;
      }
      resolvedCustName = selected.nama;
      resolvedCustPhone = selected.telepon;
    }

    const choosenService = services.find(s => s.id === selectedServiceId);
    if (!choosenService) {
      alert("Pilih jenis layanan laundry terlebih dahulu.");
      return;
    }

    // Invoice Formatting: TRX / YYMMDD / index
    const now = new Date();
    const yy = now.getFullYear().toString().slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const numSuffix = Math.floor(10000 + Math.random() * 90000).toString(); // Secure serial
    const trxId = `TRX/${yy}${mm}${dd}/${numSuffix}`;

    // Datetime Calculations:
    const receptionIso = now.toISOString();
    // String formats
    const tanggalMasuk = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ` +
                         `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

    const completionDate = new Date(now.getTime() + choosenService.durasiJam * 60 * 60 * 1000);
    const estimasiSelesai = `${completionDate.getFullYear()}-${String(completionDate.getMonth()+1).padStart(2,"0")}-${String(completionDate.getDate()).padStart(2,"0")} ` +
                            `${String(completionDate.getHours()).padStart(2,"0")}:${String(completionDate.getMinutes()).padStart(2,"0")}`;

    const newTrx: LaundryTransaction = {
      id: trxId,
      customerName: resolvedCustName,
      customerPhone: resolvedCustPhone,
      layananId: choosenService.id,
      layananNama: choosenService.nama,
      parfum: selectedParfum,
      berat: trxWeight,
      totalHarga: calculatedTotal,
      status: "Antrian",
      statusBayar: statusBayar,
      pembayaranMetode: paymentMethod,
      tanggalMasuk,
      estimasiSelesai,
      userId: activeOwnerId
    };

    await onAddTransaction(newTrx);
    
    // Reset fields
    setSelectedCustId("");
    setCustomCustName("");
    setCustomCustPhone("");
    setCreateCustInline(false);
    setSelectedServiceId("");
    setTrxWeight(1);
    setTrxNotes("");
    setStatusBayar("Belum Lunas");
    setIsCreatingTrx(false);

    if (onCloseCreateModalDirectly) onCloseCreateModalDirectly();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOwnerId) return;
    if (!newCustName || !newCustPhone) return;

    const newId = "CUST-" + Date.now().toString().slice(-6);
    const newCust: Customer = {
      id: newId,
      nama: newCustName,
      telepon: newCustPhone,
      alamat: newCustAddress,
      userId: activeOwnerId,
      createdAt: new Date().toISOString()
    };

    await onAddCustomer(newCust);
    setNewCustName("");
    setNewCustPhone("");
    setNewCustAddress("");
    setIsCreatingCust(false);
    
    if (onCloseCustomerModalDirectly) onCloseCustomerModalDirectly();
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOwnerId) return;
    if (!newServName || newServPrice <= 0) return;

    const newId = "SERV-" + Date.now().toString().slice(-6);
    const newService: Service = {
      id: newId,
      nama: newServName,
      tipe: newServType,
      harga: newServPrice,
      durasiJam: newServDuration,
      userId: activeOwnerId
    };

    await onAddService(newService);
    setNewServName("");
    setNewServPrice(0);
    setNewServDuration(48);
    setIsCreatingServ(false);

    if (onCloseServiceModalDirectly) onCloseServiceModalDirectly();
  };

  // Printing Trigger simulator
  const startPrintSimulation = (trx: LaundryTransaction) => {
    setPrintingTrx(trx);
    setPrintingProgress(0);
    setIsPrintFinished(false);

    const interval = setInterval(() => {
      setPrintingProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsPrintFinished(true);
          return 100;
        }
        return prev + 20;
      });
    }, 250);
  };

  // WhatsApp formatted receipt launcher
  const sendWhatsAppReceipt = (trx: LaundryTransaction) => {
    const formattedPhone = trx.customerPhone.replace(/[^0-9]/g, "");
    const waPhone = formattedPhone.startsWith("0") ? "62" + formattedPhone.substring(1) : formattedPhone;

    const text = `*DAMDAM LAUNDRY NOTA OPERASIONAL*\n` +
                 `===============================\n` +
                 `No Nota  : ${trx.id}\n` +
                 `Pelanggan: ${trx.customerName}\n` +
                 `Masuk    : ${trx.tanggalMasuk}\n` +
                 `Layanan  : ${trx.layananNama}\n` +
                 `Takaran  : ${trx.berat} ${trx.layananNama.toLowerCase().includes("kiloan") ? "Kg" : "Pcs"}\n` +
                 `Parfum   : ${trx.parfum}\n` +
                 `Catatan  : ${trx.notes || "-"}\n` +
                 `-------------------------------\n` +
                 `*TOTAL BILL: Rp ${trx.totalHarga.toLocaleString("id-ID")}*\n` +
                 `Status   : ${trx.status.toUpperCase()}\n` +
                 `Bayar    : *${trx.statusBayar.toUpperCase()}* (${trx.pembayaranMetode})\n` +
                 `Estimasi Selesai : *${trx.estimasiSelesai}*\n` +
                 `===============================\n` +
                 `Pakaian Anda adalah amanah kami. Terima kasih atas kepercayaan Anda!\n` +
                 `_Damdam Laundry & Care_`;

    const encoded = encodeURIComponent(text);
    const targetUrl = `https://api.whatsapp.com/send?phone=${waPhone}&text=${encoded}`;
    window.open(targetUrl, "_blank");
  };

  const updateStatusFlow = async (id: string, currentStatus: string) => {
    let nextStatus: "Antrian" | "Proses" | "Selesai" | "Diambil" | "Batal" = "Antrian";
    let updates: Partial<LaundryTransaction> = {};

    if (currentStatus === "Antrian") {
      nextStatus = "Proses";
    } else if (currentStatus === "Proses") {
      nextStatus = "Selesai";
      updates.tanggalSelesai = new Date().toISOString();
    } else if (currentStatus === "Selesai") {
      nextStatus = "Diambil";
      updates.tanggalDiambil = new Date().toISOString();
      updates.statusBayar = "Lunas"; // auto reconcile
    }

    updates.status = nextStatus;
    
    await onUpdateTransaction(id, updates);
  };

  // Format amount to local IDR
  const formatIDR = (val: number) => {
    return "Rp " + val.toLocaleString("id-ID");
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans">
      
      {/* Search Header */}
      <div className="p-4 bg-[#121214] border-b border-zinc-900 space-y-3 shrink-0 text-left">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
            <FileText className="w-4 h-4 text-emerald-500" /> OPERASIONAL NOTA LAUNDRY
          </h2>
          <button
            onClick={() => setIsCreatingTrx(true)}
            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500 hover:bg-emerald-450 text-black text-[9.5px] font-black uppercase tracking-wider rounded-none transition shadow-md active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3px]" /> Buat Nota
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Cari transaksi berdasarkan nama/nota..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-850 px-3.5 py-2 pl-9 text-xs text-zinc-100 rounded-none focus:outline-none focus:border-emerald-500 font-semibold"
          />
          <Search className="w-4 h-4 text-zinc-550 absolute left-3 top-2.5" />
        </div>

        {/* Status Filter Tab Buttons */}
        <div className="flex overflow-x-auto gap-1.5 no-scrollbar pb-1 text-[8.5px] font-black uppercase tracking-wider select-none">
          {["Semua", "Antrian", "Proses", "Selesai", "Diambil", "Batal"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 cursor-pointer shrink-0 border rounded-none shadow-xs ${
                statusFilter === st
                  ? "bg-emerald-500 text-black border-emerald-500"
                  : "bg-zinc-950 text-zinc-400 border-zinc-850 hover:text-white hover:border-zinc-700"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredTrx.length === 0 ? (
          <div className="py-12 border border-dashed border-zinc-850 bg-zinc-950/20 text-center rounded-none select-none">
            <span className="text-xs font-black text-zinc-500 uppercase tracking-widest block mb-1">
              Tidak Ada Nota laundry Ditemukan
            </span>
            <p className="text-[10.5px] text-zinc-650 font-bold max-w-[240px] mx-auto text-balance">
              Cobalah sesuaikan kata kunci pemfilteran atau rekam transaksi laundry baru.
            </p>
          </div>
        ) : (
          filteredTrx.map((trx) => {
            const isCompleted = trx.status === "Selesai" || trx.status === "Diambil";
            
            const badgeColorStr = 
              trx.status === "Antrian" ? "bg-zinc-950 text-zinc-400 border-zinc-800" :
              trx.status === "Proses" ? "bg-indigo-950/40 text-indigo-400 border-indigo-900/45" :
              trx.status === "Selesai" ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/50" :
              trx.status === "Diambil" ? "bg-zinc-900 text-zinc-550 border-zinc-850" : "bg-red-950/30 text-rose-500 border-red-900/40";

            return (
              <div 
                key={trx.id}
                className="bg-[#121214] border border-[#27272A] p-4 rounded-none space-y-3 text-left relative shadow-sm"
              >
                {/* 1. Header Row */}
                <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-[#10B981] font-black border border-emerald-950 bg-emerald-950/30 px-2 py-0.5">
                      {trx.id}
                    </span>
                    <span className={`text-[8.5px] font-black px-1.5 py-0.5 border uppercase tracking-wider font-mono ${badgeColorStr}`}>
                      {trx.status}
                    </span>
                  </div>

                  {/* Date entered */}
                  <span className="text-[9px] font-mono text-zinc-500">{trx.tanggalMasuk}</span>
                </div>

                {/* 2. Content Parameters */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between font-bold">
                    <span className="text-zinc-400">Pelanggan:</span>
                    <span className="text-white font-extrabold">{trx.customerName} ({trx.customerPhone})</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-zinc-400">Paket:</span>
                    <span className="text-zinc-200 font-semibold">{trx.layananNama}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-zinc-400">Takaran:</span>
                    <span className="text-emerald-400 font-bold">{trx.berat} {trx.layananNama.toLowerCase().includes("kiloan") ? "Kg" : "Pcs"}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-zinc-400">Pewangi / Parfum:</span>
                    <span className="text-purple-400 font-bold">✨ {trx.parfum}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-zinc-400">Estimasi Selesai:</span>
                    <span className="text-amber-400 font-bold">{trx.estimasiSelesai}</span>
                  </div>
                  {trx.notes && (
                    <div className="bg-zinc-950 border border-zinc-900 p-2 text-[10.5px] text-zinc-450 italic font-medium leading-relaxed mt-1.5">
                      Catatan: {trx.notes}
                    </div>
                  )}
                </div>

                {/* 3. Pricing Row */}
                <div className="flex items-center justify-between border-t border-b border-zinc-900 py-2.5 font-mono text-xs">
                  <div>
                    <span className="block text-[8.5px] text-zinc-500 font-black uppercase">Metode Pembayaran</span>
                    <span className="font-extrabold text-zinc-300 flex items-center gap-1 mt-0.5">
                      <CreditCard className="w-3 h-3 text-emerald-500" />
                      {trx.pembayaranMetode.toUpperCase()}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="block text-[8.5px] text-zinc-500 font-black uppercase">Total Tagihan</span>
                    <span className="text-sm font-black text-white">{formatIDR(trx.totalHarga)}</span>
                  </div>

                  <div>
                    <span className="block text-[8.5px] text-zinc-500 font-black uppercase">Status Bayar</span>
                    <span className={`inline-block text-[8px] font-black px-1.5 py-0.5 rounded-none mt-0.5 uppercase tracking-wider ${trx.statusBayar === "Lunas" ? "bg-emerald-950/20 text-emerald-400 border border-emerald-900/60" : "bg-red-955/15 text-rose-500 border border-red-950/50"}`}>
                      {trx.statusBayar}
                    </span>
                  </div>
                </div>

                {/* 4. Action buttons */}
                <div className="flex gap-2 justify-end text-[9px] font-black uppercase tracking-widest pt-1.5">
                  <button
                    onClick={() => startPrintSimulation(trx)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition duration-150 rounded-none cursor-pointer"
                    title="Cetak struk nota ke Portable Bluetooth thermal printer"
                  >
                    <Printer className="w-3.5 h-3.5" /> Cetak
                  </button>

                  <button
                    onClick={() => sendWhatsAppReceipt(trx)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-emerald-400 hover:text-emerald-350 transition duration-150 rounded-none cursor-pointer"
                    title="Kirim file/text nota ke WhatsApp pelanggan"
                  >
                    <Share2 className="w-3.5 h-3.5" /> WA
                  </button>

                  <button
                    onClick={() => {
                      triggerConfirm(
                        "Hapus Transaksi",
                        `Apakah Anda yakin ingin menghapus nota laundry ${trx.id} milik ${trx.customerName}? Tindakan ini permanen.`,
                        () => onDeleteTransaction(trx.id),
                        true
                      );
                    }}
                    className="flex items-center gap-1.5 px-2 bg-zinc-950 border border-zinc-900 hover:bg-rose-950/20 text-zinc-650 hover:text-rose-500 transition duration-150 rounded-none cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Flow progress action button */}
                  {trx.status !== "Diambil" && trx.status !== "Batal" && (
                    <button
                      onClick={() => updateStatusFlow(trx.id, trx.status)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-black font-black font-mono transition shadow-md active:scale-95 cursor-pointer rounded-none ${
                        trx.status === "Antrian" ? "bg-indigo-300 hover:bg-indigo-400" :
                        trx.status === "Proses" ? "bg-amber-400 hover:bg-amber-500" : "bg-emerald-500 hover:bg-emerald-450"
                      }`}
                    >
                      {trx.status === "Antrian" ? "Mulai Proses &rsaquo;" :
                       trx.status === "Proses" ? "Diselesaikan &rsaquo;" : "Diambil/Serahkan &rsaquo;"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DIALOG A: CREATE TRANSACTION MODULE */}
      {isCreatingTrx && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-xs z-50 flex flex-col justify-end p-0">
          <div className="w-full bg-[#121214] border-t border-[#27272A] p-5 shadow-2xl relative max-h-[92%] overflow-y-auto rounded-t-xl text-left">
            <button 
              onClick={() => {
                setIsCreatingTrx(false);
                if (onCloseCreateModalDirectly) onCloseCreateModalDirectly();
              }}
              className="absolute top-4 right-4 text-zinc-550 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-xs font-black uppercase text-emerald-500 tracking-widest mb-4 flex items-center gap-1.5 pb-2 border-b border-zinc-900">
              <FileText className="w-4 h-4" /> REKAM NOTA TRANSAKSI LAUNDRY
            </h3>

            <form onSubmit={handleCreateTransaction} className="space-y-4">
              {/* Customer Selector Type */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] text-zinc-450 font-black uppercase tracking-wider block">1. Pelanggan Sasar</label>
                  <button
                    type="button"
                    onClick={() => setCreateCustInline(!createCustInline)}
                    className="text-[9.5px] text-emerald-400 hover:text-emerald-300 underline font-black uppercase tracking-wider"
                  >
                    {createCustInline ? "Pilih dari Database" : "+ Pasang Pelanggan Baru"}
                  </button>
                </div>

                {createCustInline ? (
                  <div className="bg-zinc-950 p-3 border border-zinc-850 space-y-3">
                    <div>
                      <label className="text-[9px] text-zinc-500 font-mono uppercase block mb-1">Nama Customer:</label>
                      <input
                        type="text"
                        placeholder="e.g., Ibu Fatimah"
                        value={customCustName}
                        onChange={(e) => setCustomCustName(e.target.value)}
                        className="w-full text-xs bg-zinc-900 border border-zinc-800 text-zinc-150 p-2 focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-500 font-mono uppercase block mb-1">No WhatsApp (e.g., 081234xxx):</label>
                      <input
                        type="tel"
                        placeholder="e.g., 08123456789"
                        value={customCustPhone}
                        onChange={(e) => setCustomCustPhone(e.target.value)}
                        className="w-full text-xs bg-zinc-900 border border-zinc-800 text-zinc-150 p-2 focus:outline-none focus:border-emerald-500 font-mono"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    {customers.length === 0 ? (
                      <p className="text-[10px] bg-zinc-950 p-3 border border-red-950/20 text-rose-500 font-black uppercase">
                        ⚠️ Database customer kosong. Sila daftar customer di menu pelanggan utama atau klik "Pasang Pelanggan Baru" di atas!
                      </p>
                    ) : (
                      <select
                        value={selectedCustId}
                        onChange={(e) => setSelectedCustId(e.target.value)}
                        className="w-full text-xs bg-zinc-950 border border-zinc-800 p-2 px-3 text-zinc-100 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                        required
                      >
                        <option value="">-- Pilih Customer --</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.nama} ({c.telepon})</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Service Layanan List Selection */}
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-450 font-black uppercase tracking-wider block">2. Pilih Jenis Layanan</label>
                {services.length === 0 ? (
                  <p className="text-[10.5px] bg-zinc-950 p-3 border border-zinc-850 text-zinc-500">
                    Sila tambahkan jenis layanan (kiloan, satuan) terlebih dahulu.
                  </p>
                ) : (
                  <select
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full text-xs bg-zinc-950 border border-zinc-800 p-2 px-3 text-zinc-100 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                    required
                  >
                    <option value="">-- Layanan Laundry --</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nama} ({formatIDR(s.harga)} / {s.tipe})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Weight or Quantity input with interactive multiplier view */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-zinc-450 font-black uppercase tracking-wider block mb-1">3. Jumlah / Berat</label>
                  <div className="flex gap-1 items-center">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={trxWeight}
                      onChange={(e) => setTrxWeight(Number(e.target.value))}
                      className="w-full text-xs font-mono font-bold bg-zinc-950 border border-zinc-800 text-zinc-200 p-2 focus:outline-none focus:border-emerald-500"
                      required
                    />
                    <span className="text-[10.5px] text-zinc-400 font-black uppercase px-2 font-mono">
                      {currentService?.tipe === "Satuan" ? "PC" : currentService?.tipe === "Meter" ? "MTR" : "KG"}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-zinc-450 font-black uppercase tracking-wider block mb-1">4. Aroma Parfum</label>
                  <select
                    value={selectedParfum}
                    onChange={(e) => setSelectedParfum(e.target.value)}
                    className="w-full text-xs bg-zinc-950 border border-zinc-800 p-2 px-3 text-zinc-100 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Lavender">Lavender Sensation</option>
                    <option value="Sakura">Sakura Blossom</option>
                    <option value="Lily">Lily Fresh</option>
                    <option value="Lemon">Lemon Citrus</option>
                    <option value="Polos">Tanpa Parfum (Netral)</option>
                  </select>
                </div>
              </div>

              {/* Status and Payment details */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-zinc-450 font-black uppercase tracking-wider block mb-1">5. Status Pembayaran</label>
                  <div className="flex bg-zinc-950 border border-zinc-850 p-0.5 font-bold uppercase text-[9px]">
                    <button
                      type="button"
                      onClick={() => setStatusBayar("Belum Lunas")}
                      className={`flex-1 py-1 px-1.5 cursor-pointer text-center ${statusBayar === "Belum Lunas" ? "bg-red-950/40 text-rose-500 border border-red-900/30" : "text-zinc-500"}`}
                    >
                      BELUM LUNAS
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusBayar("Lunas")}
                      className={`flex-1 py-1 px-1.5 cursor-pointer text-center ${statusBayar === "Lunas" ? "bg-emerald-950 text-emerald-400 border border-emerald-900/30" : "text-zinc-500"}`}
                    >
                      LUNAS
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-zinc-450 font-black uppercase tracking-wider block mb-1">6. Metode Bayar</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full text-xs bg-zinc-950 border border-zinc-800 p-2 text-zinc-100 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Tunai">Tunai / Cash</option>
                    <option value="QRIS">QRIS / E-Wallet</option>
                    <option value="Transfer">Transfer Bank</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] text-zinc-450 font-black uppercase tracking-wider block mb-1">7. Catatan / Anomali</label>
                <input
                  type="text"
                  placeholder="e.g., Ada kancing lepas, noda tinta di lengan"
                  value={trxNotes}
                  onChange={(e) => setTrxNotes(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-850 text-zinc-150 p-2 focus:outline-none focus:border-emerald-500 font-semibold"
                />
              </div>

              {/* Calculator Panel Box */}
              <div className="bg-zinc-950 border border-zinc-850 p-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-zinc-500 font-extrabold uppercase font-mono">RINCIAN HARGA:</span>
                  <span className="text-[10px] text-zinc-450 font-mono font-bold">
                    {trxWeight} {currentService?.tipe || "Kg"} x {formatIDR(currentService?.harga || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-end border-t border-zinc-800/80 pt-2 mt-2">
                  <span className="text-[11px] text-zinc-200 font-black uppercase">ESTIMASI TOTAL BILL:</span>
                  <span className="text-xl font-black text-emerald-400 font-mono">
                    {formatIDR(calculatedTotal)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingTrx(false);
                    if (onCloseCreateModalDirectly) onCloseCreateModalDirectly();
                  }}
                  className="flex-1 py-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 text-zinc-400 hover:text-white text-[10.5px] font-black uppercase tracking-widest cursor-pointer transition select-none"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-450 text-black text-[10.5px] font-black uppercase tracking-widest cursor-pointer transition select-none"
                >
                  Simpan Nota Laundry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIALOG B: CREATE CUSTOMER */}
      {isCreatingCust && (
        <div className="absolute inset-0 bg-black/98 z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-[320px] bg-[#121214] border border-[#27272A] p-5 shadow-2xl relative text-left">
            <button onClick={() => { setIsCreatingCust(false); if (onCloseCustomerModalDirectly) onCloseCustomerModalDirectly(); }} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-xs font-black uppercase text-emerald-500 tracking-widest mb-4 pb-2 border-b border-zinc-900 flex items-center gap-1">
              <UserPlus className="w-4 h-4" /> TAMBAH PELANGGAN LAUNDRY
            </h3>

            <form onSubmit={handleCreateCustomer} className="space-y-3.5">
              <div>
                <label className="text-[9.5px] text-zinc-500 font-black uppercase block mb-1">Nama Lengkap:</label>
                <input
                  type="text"
                  placeholder="e.g., Ibu Fatimah"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-850 p-2 text-zinc-150 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[9.5px] text-zinc-500 font-black uppercase block mb-1">No WhatsApp:</label>
                <input
                  type="tel"
                  placeholder="e.g., 08123456789"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full text-xs font-mono bg-zinc-950 border border-zinc-850 p-2 text-zinc-150 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-[9.5px] text-zinc-500 font-black uppercase block mb-1">Alamat (Optional):</label>
                <input
                  type="text"
                  placeholder="e.g., Perum Damai, Blok B No. 12"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-850 p-2 text-zinc-150 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-450 text-black font-black text-[10.5px] uppercase tracking-widest cursor-pointer mt-2"
              >
                Simpan Pelanggan
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DIALOG C: CREATE SERVICE */}
      {isCreatingServ && (
        <div className="absolute inset-0 bg-black/98 z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-[320px] bg-[#121214] border border-[#27272A] p-5 shadow-2xl relative text-left">
            <button onClick={() => { setIsCreatingServ(false); if (onCloseServiceModalDirectly) onCloseServiceModalDirectly(); }} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-xs font-black uppercase text-emerald-500 tracking-widest mb-4 pb-2 border-b border-zinc-900 flex items-center gap-1">
              <Plus className="w-4 h-4" /> TAMBAH JENIS LAYANAN
            </h3>

            <form onSubmit={handleCreateService} className="space-y-3.5">
              <div>
                <label className="text-[9.5px] text-zinc-500 font-black uppercase block mb-1">Nama Layanan:</label>
                <input
                  type="text"
                  placeholder="e.g., Cuci Setrika Express"
                  value={newServName}
                  onChange={(e) => setNewServName(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-850 p-2 text-zinc-150 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[9.5px] text-zinc-500 font-black uppercase block mb-1">Tipe Takaran:</label>
                  <select
                    value={newServType}
                    onChange={(e) => setNewServType(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-850 p-2 text-zinc-150 focus:outline-none cursor-pointer"
                  >
                    <option value="Kiloan">Kiloan (KG)</option>
                    <option value="Satuan">Satuan (Pcs)</option>
                    <option value="Meter">Meter (MTR)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[9.5px] text-zinc-500 font-black uppercase block mb-1">Durasi (Jam):</label>
                  <input
                    type="number"
                    min="1"
                    value={newServDuration}
                    onChange={(e) => setNewServDuration(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-850 p-2 text-zinc-150 font-mono focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[9.5px] text-zinc-500 font-black uppercase block mb-1">Harga per Unit (Rp):</label>
                <input
                  type="number"
                  min="100"
                  placeholder="e.g., 8000"
                  value={newServPrice}
                  onChange={(e) => setNewServPrice(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-zinc-950 border border-zinc-850 p-2 text-zinc-150 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-450 text-black font-black text-[10.5px] uppercase tracking-widest cursor-pointer mt-2"
              >
                Simpan Layanan
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MOCK PRINTER BLUEBLUETOOTH BLUETOOTH */}
      {printingTrx && (
        <div className="absolute inset-0 bg-black/95 z-55 flex flex-col justify-between p-6 overflow-y-auto animate-fade-in font-sans">
          <div className="border-b border-zinc-900 pb-3 flex items-center gap-2 text-left">
            <Smartphone className="w-4 h-4 text-emerald-500 animate-bounce" />
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider">KONEKSI PRINTER PORTABLE BLUETOOTH</h4>
              <p className="text-[8.5px] text-zinc-500 font-bold uppercase mt-0.5">Mencetak nota thermal via Bluetooth RPP02N (58mm)</p>
            </div>
          </div>

          {/* Active printing progress */}
          {!isPrintFinished ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <span className="w-12 h-12 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              <p className="text-[10px] text-zinc-400 font-mono font-black uppercase tracking-widest animate-pulse">
                Mengirim paket cetak data {printingProgress}%...
              </p>
              <div className="w-40 h-2 bg-zinc-950 border border-zinc-900 rounded-none overflow-hidden">
                <div style={{ width: `${printingProgress}%` }} className="h-full bg-emerald-500 transition-all duration-300" />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-4 space-y-4">
              {/* POS Thermal simulation layout */}
              <div className="w-[240px] bg-white text-black p-4 font-mono text-[9px] border-b-4 border-dashed border-zinc-400 text-left leading-normal shadow-2xl relative select-text selection:bg-emerald-250">
                <div className="text-center font-black space-y-0.5 mb-2 border-b border-dashed border-black pb-2">
                  <span className="block text-xs uppercase tracking-tight">DAMDAM LAUNDRY</span>
                  <span className="block text-[7.5px] font-bold">Jl. Damai Raya No. 42, Sleman</span>
                  <span className="block text-[7.5px] font-bold">Telp: 0812-3456-789</span>
                </div>

                <div className="space-y-0.5 border-b border-dashed border-black pb-2 mb-2">
                  <p>Nota: <span className="font-bold">{printingTrx.id}</span></p>
                  <p>Syaf: Admin Utama</p>
                  <p>Cust: <span className="font-bold">{printingTrx.customerName}</span></p>
                  <p>Telp: {printingTrx.customerPhone}</p>
                  <p>Masuk: {printingTrx.tanggalMasuk}</p>
                </div>

                <div className="space-y-1 mb-2">
                  <div className="flex justify-between items-start font-bold">
                    <span>{printingTrx.layananNama}</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span>{printingTrx.berat} x {formatIDR(printingTrx.totalHarga / printingTrx.berat)}</span>
                    <span>{formatIDR(printingTrx.totalHarga)}</span>
                  </div>
                  {printingTrx.parfum && (
                    <p className="pl-2 italic">&bull; Parfum: {printingTrx.parfum}</p>
                  )}
                  {printingTrx.notes && (
                    <p className="pl-2 italic text-[8px]">&bull; Catatan: {printingTrx.notes}</p>
                  )}
                </div>

                <div className="border-t border-dashed border-black pt-2 space-y-0.5 border-b mb-2 pb-2">
                  <div className="flex justify-between font-black text-[10px]">
                    <span>TOTAL TAGIHAN:</span>
                    <span>{formatIDR(printingTrx.totalHarga)}</span>
                  </div>
                  <div className="flex justify-between text-[8px]">
                    <span>Status Bayar:</span>
                    <span className="font-bold uppercase">{printingTrx.statusBayar}</span>
                  </div>
                  <div className="flex justify-between text-[8px]">
                    <span>Metode:</span>
                    <span>{printingTrx.pembayaranMetode}</span>
                  </div>
                  <div className="flex justify-between text-[8.5px] font-bold">
                    <span>Estimasi Selesai:</span>
                    <span>{printingTrx.estimasiSelesai}</span>
                  </div>
                </div>

                <div className="text-center font-bold text-[8px] pt-1">
                  <p>TERIMA KASIH ATAS KUNJUNGANNYA</p>
                  <p>Pekat Bersih, Hidup Berkah!</p>
                </div>
              </div>

              <div className="text-center space-y-1">
                <span className="inline-flex bg-emerald-950 text-emerald-400 border border-emerald-900 font-bold px-2.5 py-1 text-[9px] uppercase tracking-wider items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Cetak ke Bluetooth Berhasil!
                </span>
                <p className="text-[8.5px] text-zinc-500 font-bold uppercase tracking-wide">Handshake Bluetooth selesai RPP02N (58mm)</p>
              </div>
            </div>
          )}

          <button
            onClick={() => setPrintingTrx(null)}
            className="w-full mt-3 py-3 bg-emerald-500 hover:bg-emerald-450 text-black text-xs font-black tracking-widest uppercase rounded-none transition shadow-md"
          >
            KEMBALI KE NOTA
          </button>
        </div>
      )}

    </div>
  );
}
