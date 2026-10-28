import React, { useState, useMemo } from "react";
import { 
  ArrowLeft, 
  Calendar, 
  ChevronRight, 
  Download, 
  FileText, 
  Search, 
  Filter, 
  Info, 
  CheckCircle, 
  ChevronDown, 
  AlertCircle,
  TrendingUp,
  DollarSign,
  User,
  ShoppingBag,
  Layers,
  Sparkles,
  Award,
  Package,
  Wrench
} from "lucide-react";
import { LaundryTransaction, Karyawan, Service, Customer } from "../types";

// Dynamic custom clipboard-clock icon to match Screenshot 1
function ClipboardClockIcon({ className = "w-5 h-5 text-zinc-400" }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      </svg>
      {/* Mini Clock Badge at bottom right of the icon */}
      <span className="absolute -bottom-1 -right-1 bg-[#0A0A0B] rounded-full p-[0.5px]">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" className="text-zinc-400">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>
    </div>
  );
}

// Format IDR Helper
const formatIDR = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value).replace("Rp", "Rp ");
};

// Indonesian date formatting to DD/MM/YYYY style
const formatIndoDate = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split(" ")[0].split("-");
  if (parts.length < 3) return dateStr;
  
  const d = parts[2].padStart(2, "0");
  const m = parts[1].padStart(2, "0");
  const y = parts[0];
  
  return `${d}/${m}/${y}`;
};

// Helper to get today's local date string as YYYY-MM-DD
const getTodayStr = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};

// Helper to format any date string safely showing Indonesian date + time
const formatReportDate = (dateStr?: string | null) => {
  if (!dateStr) return "";
  const cleaned = dateStr.replace("T", " ").trim();
  const parts = cleaned.split(" ");
  const datePart = parts[0];
  const timePart = parts[1] || "";
  const formattedIndo = formatIndoDate(datePart);
  return timePart ? `${formattedIndo}, ${timePart.substring(0, 5)}` : formattedIndo;
};

interface ReportType {
  id: string;
  nama: string;
  desc: string;
  isPro?: boolean;
  isBaru?: boolean;
}

interface LaundryReportsProps {
  transactions: LaundryTransaction[];
  employees: Karyawan[];
  services: Service[];
  customers: Customer[];
  onBack?: () => void;
  // External filter trigger values from dashboard
  initialReportId?: string | null;
  onClearInitialReport?: () => void;
  onSelectTransaction?: (trxId: string) => void;
}

export function LaundryReports({
  transactions,
  employees,
  services,
  customers,
  onBack,
  initialReportId,
  onClearInitialReport,
  onSelectTransaction
}: LaundryReportsProps) {
  // Available reports list directly mirroring Screenshot 1
  const reports: ReportType[] = [
    { id: "omset", nama: "Laporan Omset Transaksi", desc: "Transaksi berdasarkan nilai omset dan pemasukan" },
    { id: "masuk", nama: "Laporan Transaksi Masuk", desc: "Transaksi berdasarkan tanggal masuk" },
    { id: "lunas", nama: "Laporan Transaksi Lunas", desc: "Transaksi berdasarkan tanggal lunas" },
    { id: "selesai", nama: "Laporan Transaksi Selesai", desc: "Transaksi berdasarkan pengerjaan selesai" },
    { id: "estimasi", nama: "Laporan Estimasi Selesai", desc: "Transaksi berdasarkan tanggal estimasi selesai pengerjaan" },
    { id: "batal", nama: "Laporan Transaksi Batal", desc: "Transaksi dengan status dibatalkan (Batal)" },
    { id: "pembayaran", nama: "Laporan Pembayaran", desc: "Transaksi berdasarkan metode pembayaran" },
    { id: "deposit", nama: "Laporan Deposit", desc: "Transaksi panjar / uang muka (Deposit / DP)" },
    { id: "kasbon", nama: "Laporan Kasbon", desc: "Catatan pinjaman kasbon & piutang karyawan" },
    { id: "piutang", nama: "Laporan Piutang", desc: "Transaksi belum lunas atau sisa piutang nota" },
    { id: "layanan", nama: "Laporan Layanan", desc: "Detail laporan performa per jenis layanan", isPro: true },
    { id: "paket", nama: "Laporan Transaksi Paket", desc: "Transaksi berdasarkan paket laundry aktif", isBaru: true, isPro: true },
    { id: "penggunaan_bahan", nama: "Laporan Penggunaan Bahan", desc: "Laporan taksiran konsumsi bahan baku operasional", isBaru: true, isPro: true },
    { id: "pelanggan", nama: "Laporan Pelanggan", desc: "Statistik performa dan loyalitas pelanggan", isPro: true }
  ];

  // State
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(
    initialReportId ? (reports.find(r => r.id === initialReportId) || null) : null
  );
  
  // Tab: "Per Transaksi" vs "Per Tanggal"
  const [activeTab, setActiveTab] = useState<"transaksi" | "tanggal">("transaksi");

  // Date filters defaulting to today's date in YYYY-MM-DD format
  const [startDate, setStartDate] = useState<string>(getTodayStr());
  const [endDate, setEndDate] = useState<string>(getTodayStr());

  // Filter components
  const [selectedService, setSelectedService] = useState<string>("Semua");
  const [selectedStatusBayar, setSelectedStatusBayar] = useState<string>("Semua Status");
  const [showSummaryDetails, setShowSummaryDetails] = useState<boolean>(false);

  // Clear query on menu navigation
  const handleReportSelect = (rep: ReportType) => {
    setSelectedReport(rep);
    onClearInitialReport?.();
    
    // Auto preset values for customized report experience
    if (rep.id === "lunas") {
      setSelectedStatusBayar("Lunas");
    } else if (rep.id === "deposit") {
      setSelectedStatusBayar("DP");
    } else if (rep.id === "piutang") {
      setSelectedStatusBayar("Belum Lunas");
    } else {
      setSelectedStatusBayar("Semua Status");
    }
  };

  const handleBackToMenu = () => {
    setSelectedReport(null);
    onClearInitialReport?.();
  };

  // Compute filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // 1. Date Range matches (using estimasiSelesai for 'estimasi' report, tanggalSelesai for 'selesai' report, and tanggalMasuk for others)
      const useEstimasi = selectedReport?.id === "estimasi";
      const useSelesai = selectedReport?.id === "selesai";
      
      let rawDate = t.tanggalMasuk;
      if (useEstimasi && t.estimasiSelesai) {
        rawDate = t.estimasiSelesai;
      } else if (useSelesai && t.tanggalSelesai) {
        rawDate = t.tanggalSelesai;
      }
      
      const tDate = rawDate.replace("T", " ").substring(0, 10);
      const inDateRange = tDate >= startDate && tDate <= endDate;
      if (!inDateRange) return false;

      // 2. Service matches
      if (selectedService !== "Semua" && t.layananNama !== selectedService) {
        return false;
      }

      // 3. Payment Status matches
      if (selectedStatusBayar !== "Semua Status") {
        if (selectedStatusBayar === "Lunas" && t.statusBayar !== "Lunas") return false;
        if (selectedStatusBayar === "Belum Lunas" && t.statusBayar !== "Belum Lunas") return false;
        if (selectedStatusBayar === "DP" && t.statusBayar !== "DP") return false;
      }

      // 4. Report-specific hard filters
      if (selectedReport) {
        if (selectedReport.id === "lunas" && t.statusBayar !== "Lunas") return false;
        if (selectedReport.id === "deposit" && t.statusBayar !== "DP") return false;
        if (selectedReport.id === "piutang" && t.statusBayar === "Lunas") return false;
        if (selectedReport.id === "selesai" && t.status !== "Selesai" && t.status !== "Diambil") return false;
        if (selectedReport.id === "batal" && t.status !== "Batal") return false;
        if (selectedReport.id === "paket") {
          const isPaket = !!t.notes && t.notes.includes("[TRANSAKSI PAKET]");
          if (!isPaket) return false;
        }
      }

      return true;
    });
  }, [transactions, selectedReport, startDate, endDate, selectedService, selectedStatusBayar]);

  // Aggregate stats totals (kg, pc, set, m, meter)
  const totals = useMemo(() => {
    let kg = 0;
    let pc = 0;
    let set = 0;
    let meter = 0;
    let count = filteredTransactions.length;
    let revenue = 0;

    filteredTransactions.forEach(t => {
      const isBatal = t.status === "Batal";
      if (!isBatal) {
        revenue += t.totalHarga;
      }

      // Analyze unit type based on service
      const sv = services.find(s => s.id === t.layananId || s.nama === t.layananNama);
      const isSatuan = sv?.tipe?.toLowerCase() === "satuan" || t.layananNama.toLowerCase().includes("kaos") || t.layananNama.toLowerCase().includes("baju") || t.layananNama.toLowerCase().includes("pc") || t.layananNama.toLowerCase().includes("helai");
      const isSet = sv?.tipe?.toLowerCase() === "set" || t.layananNama.toLowerCase().includes("set") || t.layananNama.toLowerCase().includes("bed cover") || t.layananNama.toLowerCase().includes("sprei");
      const isMeter = sv?.tipe?.toLowerCase() === "meter" || t.layananNama.toLowerCase().includes("meter") || t.layananNama.toLowerCase().includes("karpet");

      if (isSatuan) {
        pc += t.berat;
      } else if (isSet) {
        set += t.berat;
      } else if (isMeter) {
        meter += t.berat;
      } else {
        kg += t.berat;
      }
    });

    return { kg, pc, set, meter, count, revenue };
  }, [filteredTransactions, services]);

  // Group by date (Screenshot 3 - "Per Tanggal")
  const groupedData = useMemo(() => {
    const map: Record<string, { date: string; revenue: number; kg: number; pc: number; set: number; meter: number; count: number }> = {};

    filteredTransactions.forEach(t => {
      const useEstimasi = selectedReport?.id === "estimasi";
      const useSelesai = selectedReport?.id === "selesai";
      
      let rawDate = t.tanggalMasuk;
      if (useEstimasi && t.estimasiSelesai) {
        rawDate = t.estimasiSelesai;
      } else if (useSelesai && t.tanggalSelesai) {
        rawDate = t.tanggalSelesai;
      }
      
      const fullDate = rawDate.replace("T", " ").substring(0, 10); // YYYY-MM-DD
      const isBatal = t.status === "Batal";
      const actualRevenue = isBatal ? 0 : t.totalHarga;

      // Analyze units
      const sv = services.find(s => s.id === t.layananId || s.nama === t.layananNama);
      const isSatuan = sv?.tipe?.toLowerCase() === "satuan" || t.layananNama.toLowerCase().includes("kaos") || t.layananNama.toLowerCase().includes("baju") || t.layananNama.toLowerCase().includes("pc") || t.layananNama.toLowerCase().includes("helai");
      const isSet = sv?.tipe?.toLowerCase() === "set" || t.layananNama.toLowerCase().includes("set") || t.layananNama.toLowerCase().includes("bed cover") || t.layananNama.toLowerCase().includes("sprei");
      const isMeter = sv?.tipe?.toLowerCase() === "meter" || t.layananNama.toLowerCase().includes("meter") || t.layananNama.toLowerCase().includes("karpet");

      let addKg = 0, addPc = 0, addSet = 0, addMeter = 0;
      if (isSatuan) {
        addPc = t.berat;
      } else if (isSet) {
        addSet = t.berat;
      } else if (isMeter) {
        addMeter = t.berat;
      } else {
        addKg = t.berat;
      }

      if (!map[fullDate]) {
        map[fullDate] = {
          date: fullDate,
          revenue: actualRevenue,
          kg: addKg,
          pc: addPc,
          set: addSet,
          meter: addMeter,
          count: 1
        };
      } else {
        map[fullDate].revenue += actualRevenue;
        map[fullDate].kg += addKg;
        map[fullDate].pc += addPc;
        map[fullDate].set += addSet;
        map[fullDate].meter += addMeter;
        map[fullDate].count += 1;
      }
    });

    // Format output array sorted descending by date
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredTransactions, services]);

  // Payment method analysis (Laporan Pembayaran)
  const paymentsAnalysis = useMemo(() => {
    let cashSum = 0, qrisSum = 0, transferSum = 0;
    let cashCount = 0, qrisCount = 0, transferCount = 0;

    filteredTransactions.forEach(t => {
      if (t.status === "Batal") return;
      const amountPaid = t.statusBayar === "DP" && t.dpAmount ? t.dpAmount : t.totalHarga;
      
      if (t.pembayaranMetode === "QRIS") {
        qrisSum += amountPaid;
        qrisCount++;
      } else if (t.pembayaranMetode === "Transfer") {
        transferSum += amountPaid;
        transferCount++;
      } else {
        cashSum += amountPaid;
        cashCount++;
      }
    });

    return [
      { metode: "Tunai / Cash", total: cashSum, count: cashCount, color: "text-emerald-400" },
      { metode: "QRIS", total: qrisSum, count: qrisCount, color: "text-blue-400" },
      { metode: "Transfer Bank", total: transferSum, count: transferCount, color: "text-purple-400" },
    ];
  }, [filteredTransactions]);

  // Employee Kasbon / Salary Advance logs
  const kasbonAnalysis = useMemo(() => {
    return employees.map(emp => {
      const advanced = emp.kasbon || 0;
      const historyNotes = emp.catatanGaji || "Tidak ada catatan kasbon.";
      return {
        id: emp.id,
        nama: emp.nama,
        username: emp.username,
        kasbon: advanced,
        notes: historyNotes
      };
    }).sort((a,b) => b.kasbon - a.kasbon);
  }, [employees]);

  // Material usage calculation (Laporan Penggunaan Bahan - Pro)
  const usageAnalysis = useMemo(() => {
    let totalKg = 0;
    filteredTransactions.forEach(t => {
      const sv = services.find(s => s.id === t.layananId || s.nama === t.layananNama);
      const isKiloan = sv?.tipe?.toLowerCase() === "kiloan" || (!t.layananNama.toLowerCase().includes("pc") && !t.layananNama.toLowerCase().includes("helai") && !t.layananNama.toLowerCase().includes("bed cover") && !t.layananNama.toLowerCase().includes("sprei"));
      if (isKiloan) {
        totalKg += t.berat;
      } else {
        totalKg += t.berat * 0.4; // Estimate 400g per satuan/set for chemical dosing ratio
      }
    });

    // Materials ratio estimation
    const detergenUsed = totalKg * 15; // 15 ml per kg
    const parfumUsed = totalKg * 8; // 8 ml per kg
    const softenerUsed = totalKg * 12; // 12 ml per kg
    const plastikUsedCount = filteredTransactions.length * 1.1; // roughly 1.1 plastic bags per invoice

    return [
      { name: "Liquid Detergent (Cuci)", qty: `${(detergenUsed / 1000).toFixed(2)} Liter`, estCost: detergenUsed * 12, unit: "ml", countValue: detergenUsed },
      { name: "Premium French Perfume", qty: `${(parfumUsed / 1000).toFixed(2)} Liter`, estCost: parfumUsed * 60, unit: "ml", countValue: parfumUsed },
      { name: "Ocean Breeze Softener", qty: `${(softenerUsed / 1000).toFixed(2)} Liter`, estCost: softenerUsed * 10, unit: "ml", countValue: softenerUsed },
      { name: "Plastik Packing Laundry", qty: `${Math.ceil(plastikUsedCount)} Pcs`, estCost: Math.ceil(plastikUsedCount) * 450, unit: "pcs", countValue: Math.ceil(plastikUsedCount) }
    ];
  }, [filteredTransactions, services]);

  // Customer Loyalty analysis (Laporan Pelanggan - Pro)
  const customerLoyalty = useMemo(() => {
    const map: Record<string, { phone: string; count: number; spend: number; totalKg: number }> = {};
    
    // Aggregate by phone number or name
    filteredTransactions.forEach(t => {
      const key = t.customerPhone || t.customerName;
      if (!map[key]) {
        map[key] = {
          phone: t.customerPhone || "-",
          count: 0,
          spend: 0,
          totalKg: 0
        };
      }
      map[key].count += 1;
      map[key].spend += t.status !== "Batal" ? t.totalHarga : 0;
      map[key].totalKg += t.berat;
    });

    return Object.entries(map).map(([name, vals]) => {
      const profile = customers.find(c => c.telepon === vals.phone || c.nama === name);
      return {
        nama: profile?.nama || name,
        telepon: vals.phone,
        panggilan: profile?.panggilan || "Kak",
        perfumeFav: profile?.parfumFavorit || "Sesuai Nota",
        count: vals.count,
        spend: vals.spend,
        totalKg: vals.totalKg
      };
    }).sort((a, b) => b.spend - a.spend);
  }, [filteredTransactions, customers]);

  // Export CSV Action
  const handleExportCSV = () => {
    let headers = "";
    let csvRows = "";
    const fileName = `Laporan_${selectedReport?.nama.replace(/\s+/g, "_")}_${startDate}_to_${endDate}.csv`;

    if (activeTab === "transaksi") {
      headers = "ID Transaksi,Nama Pelanggan,Telepon,Layanan,Jumlah (Rating Unit),Status Pembayaran,Metode Pembayaran,Sisa Tagihan,Status,Total Harga,Tanggal Masuk\n";
      csvRows = filteredTransactions.map(t => {
        const isDp = t.statusBayar === "DP";
        const dpVal = t.dpAmount || 0;
        const due = isDp ? (t.totalHarga - dpVal) : (t.statusBayar === "Belum Lunas" ? t.totalHarga : 0);
        return `"${t.id}","${t.customerName}","${t.customerPhone}","${t.layananNama}","${t.berat}","${t.statusBayar}","${t.pembayaranMetode}","${due}","${t.status}","${t.totalHarga}","${t.tanggalMasuk}"`;
      }).join("\n");
    } else {
      headers = "Tanggal,Total Jasa (Kg),Satuan (Pc),Prestige (Set),Panjang (Meter),Banyak Transaksi,Total Omset (Rp)\n";
      csvRows = groupedData.map(d => {
        return `"${d.date}","${d.kg.toFixed(3)}","${d.pc}","${d.set}","${d.meter.toFixed(1)}","${d.count}","${d.revenue}"`;
      }).join("\n");
    }

    const blob = new Blob(["\uFEFF" + headers + csvRows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0B] text-white">
      {/* 1. REPORT MENU LIST SCREEN */}
      {!selectedReport ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Centered screen title head */}
          <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-[#27272A] bg-[#0C0C0E]">
            <div className="w-10"></div>
            <h1 className="text-base font-black tracking-wider text-center flex-1 text-white">Laporan</h1>
            <div className="w-10"></div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5 scrollbar-thin">
            {reports.map((r, idx) => (
              <button
                key={r.id}
                onClick={() => handleReportSelect(r)}
                className="w-full flex items-center justify-between py-3.5 px-3 border-b border-zinc-900/65 hover:bg-zinc-900/30 text-left transition duration-155 group active:bg-zinc-900/50"
              >
                <div className="flex items-center gap-3">
                  <ClipboardClockIcon className="w-5 h-5 text-zinc-400 group-hover:text-emerald-400 transition" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11.5px] font-bold text-zinc-200 group-hover:text-white transition tracking-wide">
                        {r.nama}
                      </span>
                      {r.isBaru && (
                        <span className="bg-[#EA580C]/20 text-[#F97316] text-[7px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-wide">
                          Baru
                        </span>
                      )}
                      {r.isPro && (
                        <span className="bg-[#10B981]/25 text-[#10B981] text-[7px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-wide">
                          Pro
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-650 group-hover:text-zinc-400 transition" />
              </button>
            ))}
            
            <div className="h-10"></div>
          </div>
        </div>
      ) : (
        /* 2. REPORT DETAIL SCREEN & QUERY RESULTS */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Custom Header with back chevron and specific title */}
          <div className="h-14 shrink-0 flex items-center justify-between px-3 border-b border-[#27272A] bg-[#0C0C0E]">
            <button 
              onClick={handleBackToMenu}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            
            <h1 className="text-xs font-black tracking-wider uppercase text-center flex-1 font-mono text-zinc-300">
              {selectedReport.nama}
            </h1>
            
            <div className="w-10"></div>
          </div>

          {/* Description Banner Matching Screenshot 2 style (Teal themed layout banner) */}
          <div className="bg-[#0e7490]/15 border-b border-[#0e7490]/25 text-[#22D3EE] px-4 py-2 text-[10px] font-medium tracking-wide text-left flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 bg-[#22D3EE] rounded-full animate-pulse shrink-0"></span>
            <span>{selectedReport.desc}</span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin pb-36">
            
            {/* Sliding Sub-Tabs Selector matching Screenshot 2/3 and user intent exactly */}
            <div className="px-4 mt-3">
              <div className="flex bg-[#121214] border border-[#27272A] p-1 rounded-none">
                <button
                  type="button"
                  onClick={() => setActiveTab("transaksi")}
                  className={`flex-1 py-1.5 text-center text-[10px] font-black uppercase tracking-wider transition ${
                    activeTab === "transaksi" 
                      ? "bg-[#0284C7]/20 text-[#0284C7] font-extrabold border-b border-[#0284C7]/80" 
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Per Transaksi
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("tanggal")}
                  className={`flex-1 py-1.5 text-center text-[10px] font-black uppercase tracking-wider transition ${
                    activeTab === "tanggal" 
                      ? "bg-[#0284C7]/20 text-[#0284C7] font-extrabold border-b border-[#0284C7]/80" 
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Per Tanggal
                </button>
              </div>
            </div>

            {/* Input Filter Form - matching screenshots nicely */}
            <div className="px-4 mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* Tanggal Awal */}
                <div className="space-y-1 text-left">
                  <label className="text-[9.5px] text-zinc-550 font-black uppercase tracking-wider block">
                    Tanggal Awal <span className="text-cyan-400 font-mono normal-case font-bold">({formatIndoDate(startDate)})</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-[#121214] border border-[#27272A] px-2 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-[#0284C7] transition rounded-none appearance-none"
                    />
                    <Calendar className="absolute right-2 top-2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                  </div>
                </div>

                {/* Tanggal Akhir */}
                <div className="space-y-1 text-left">
                  <label className="text-[9.5px] text-zinc-550 font-black uppercase tracking-wider block">
                    Tanggal Akhir <span className="text-cyan-400 font-mono normal-case font-bold">({formatIndoDate(endDate)})</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-[#121214] border border-[#27272A] px-2 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-[#0284C7] transition rounded-none appearance-none"
                    />
                    <Calendar className="absolute right-2 top-2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Layanan Selector Dropdown */}
              <div className="space-y-1 text-left">
                <label className="text-[9.5px] text-zinc-550 font-black uppercase tracking-wider block">Layanan</label>
                <div className="relative">
                  <select
                    value={selectedService}
                    onChange={(e) => setSelectedService(e.target.value)}
                    className="w-full bg-[#121214] border border-[#27272A] px-2 py-2 text-xs text-zinc-200 outline-none focus:border-[#0284C7] transition rounded-none appearance-none"
                  >
                    <option value="Semua">Semua Layanan</option>
                    {services.map(s => (
                      <option key={s.id} value={s.nama}>{s.nama}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* Status Pembayaran Dropdown Filter */}
              <div className="space-y-1 text-left">
                <label className="text-[9.5px] text-zinc-550 font-black uppercase tracking-wider block">Status Pembayaran</label>
                <div className="relative">
                  <select
                    value={selectedStatusBayar}
                    onChange={(e) => setSelectedStatusBayar(e.target.value)}
                    className="w-full bg-[#121214] border border-[#27272A] px-2 py-2 text-xs text-zinc-200 outline-none focus:border-[#0284C7] transition rounded-none appearance-none"
                    disabled={["lunas", "deposit", "piutang"].includes(selectedReport.id)}
                  >
                    <option value="Semua Status">Semua Status</option>
                    <option value="Lunas">Lunas (Paid)</option>
                    <option value="Belum Lunas">Belum Lunas (Unpaid)</option>
                    <option value="DP">Deposit (DP / Panjar)</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* Blue "Cari" Button */}
              <button
                type="button"
                className="w-full bg-[#0284C7] hover:bg-[#0284C7]/90 active:bg-[#0284C7]/80 text-white font-bold text-xs py-2.5 uppercase tracking-wide transition rounded-none hover:shadow-lg hover:shadow-sky-950/20"
              >
                Cari
              </button>
            </div>

            {/* Speficic visual analysis panels for custom report views! */}
            
            {/* A. Grouped Payment Breakdown (Only for Laporan Pembayaran) */}
            {selectedReport.id === "pembayaran" && (
              <div className="mx-4 mt-5 p-3.5 bg-[#121214] border border-[#27272A] space-y-3 text-left">
                <h4 className="text-[10px] font-black text-emerald-400 tracking-wider uppercase flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> METODE PEMBAYARAN PENJUALAN
                </h4>
                <div className="divide-y divide-zinc-900">
                  {paymentsAnalysis.map((p, idx) => (
                    <div key={idx} className="py-2 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-zinc-300">{p.metode}</p>
                        <span className="text-[9px] text-zinc-500">{p.count} Transaksi</span>
                      </div>
                      <p className={`font-mono font-black ${p.color}`}>{formatIDR(p.total)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* B. Materials Estimator (Only for Laporan Penggunaan Bahan - PRO) */}
            {selectedReport.id === "penggunaan_bahan" && (
              <div className="mx-4 mt-5 p-3.5 bg-[#121214] border border-[#27272A] space-y-3 text-left">
                <h4 className="text-[10px] font-black text-rose-400 tracking-wider uppercase flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" /> TAKSIRAN KONSUMSI ALAT & BAHAN BAKU
                </h4>
                <p className="text-[8.5px] text-zinc-500 uppercase font-bold leading-normal">
                  Estimasi pemakaian chemical & packing berdasarkan volume laundry ({totals.kg.toFixed(2)} Kg total setara).
                </p>
                <div className="divide-y divide-zinc-900">
                  {usageAnalysis.map((u, idx) => (
                    <div key={idx} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-zinc-300">{u.name}</p>
                        <span className="text-[9.5px] text-zinc-500">Estimasi Terpakai: {u.qty}</span>
                      </div>
                      <span className="font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[10px]">
                        ~ {formatIDR(u.estCost)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* C. Laporan Kasbon & Absensi Gaji (Only for Laporan Kasbon) */}
            {selectedReport.id === "kasbon" && (
              <div className="mx-4 mt-5 p-3.5 bg-[#121214] border border-[#27272A] space-y-3 text-left">
                <h4 className="text-[10px] font-black text-amber-500 tracking-wider uppercase flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" /> REKAP PINJAMAN KASBON AKTIF STAF
                </h4>
                {kasbonAnalysis.length === 0 ? (
                  <p className="text-zinc-500 text-xs py-2">Tidak ada data staf terdaftar.</p>
                ) : (
                  <div className="divide-y divide-zinc-900">
                    {kasbonAnalysis.map((k) => (
                      <div key={k.id} className="py-2.5 text-xs">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-bold text-zinc-200">{k.nama} <span className="text-zinc-550 font-mono text-[10px]">({k.username})</span></p>
                            <p className="text-[9px] text-zinc-500 italic mt-0.5">{k.notes}</p>
                          </div>
                          <span className="font-mono font-black text-amber-500 bg-amber-950/20 px-2.5 py-1 border border-amber-900/30">
                            {formatIDR(k.kasbon)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 flex justify-between text-xs font-bold font-mono">
                      <span className="text-zinc-500">TOTAL SELURUH KASBON:</span>
                      <span className="text-amber-500">{formatIDR(kasbonAnalysis.reduce((s,x) => s+x.kasbon, 0))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* D. Laporan Pelanggan (Loyalty spending - PRO) */}
            {selectedReport.id === "pelanggan" && (
              <div className="mx-4 mt-5 p-3.5 bg-[#121214] border border-[#27272A] space-y-3 text-left">
                <h4 className="text-[10px] font-black text-emerald-400 tracking-wider uppercase flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> REKAP CUSTOMER SPENDING & HABIT
                </h4>
                <div className="divide-y divide-zinc-900">
                  {customerLoyalty.slice(0, 8).map((c, idx) => (
                    <div key={idx} className="py-2.5 text-xs flex justify-between items-start">
                      <div>
                        <p className="font-extrabold text-zinc-200">
                          {idx + 1}. {c.nama} <span className="text-zinc-500 font-mono text-[9px]">({c.telepon})</span>
                        </p>
                        <p className="text-[9px] text-zinc-500 mt-1 uppercase font-bold tracking-wide">
                          ✨ {c.count} x Order ({c.totalKg.toFixed(1)} Unit total) | Parfum: {c.perfumeFav}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-black text-emerald-400">{formatIDR(c.spend)}</p>
                        <span className="text-[8px] uppercase tracking-wider text-emerald-600 bg-emerald-950/25 px-1 py-0.5 border border-emerald-900/40">Loyal</span>
                      </div>
                    </div>
                  ))}
                  {customerLoyalty.length === 0 && (
                    <p className="text-zinc-500 text-xs py-2">Tidak ada data history dalam rentang tanggal.</p>
                  )}
                </div>
              </div>
            )}

            {/* DATA LIST SECTION */}
            <div className="mt-5 px-4 text-left">
              <h3 className="text-[9.5px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-900 pb-1.5 mb-2 flex items-center justify-between">
                <span>HASIL PENYARINGAN ({totals.count} DATA RAWI)</span>
                {totalDebtAmountOnly(filteredTransactions) > 0 && (
                  <span className="text-amber-500 font-mono" title="Total sisa piutang modal">Sisa Kolateral Piutang: {formatIDR(totalDebtAmountOnly(filteredTransactions))}</span>
                )}
              </h3>

              {/* TAB 1: PER TRANSAKSI - SCREENSHOT 2 */}
              {activeTab === "transaksi" ? (
                <div className="space-y-2 mt-2">
                  {filteredTransactions.length === 0 ? (
                    <div className="py-12 text-center text-zinc-650 space-y-2">
                      <AlertCircle className="w-8 h-8 text-zinc-700 mx-auto" />
                      <p className="text-xs">Tidak ditemukan transaksi yang cocok.</p>
                    </div>
                  ) : (
                    filteredTransactions.map((t) => {
                      // Work out quantity units details nicely (Screenshot 2 "5,03 kg")
                      const sv = services.find(s => s.id === t.layananId || s.nama === t.layananNama);
                      const unitUnit = sv?.tipe || "kg";
                      const qtyFormatted = `${t.berat.toString().replace(".", ",")} ${unitUnit.toLowerCase()}`;

                      return (
                        <div 
                          key={t.id}
                          onClick={() => onSelectTransaction?.(t.id)}
                          className="bg-[#121214] border border-[#27272A] p-3 text-xs flex justify-between items-start group hover:border-[#0284C7] cursor-pointer hover:bg-zinc-900/25 active:scale-[0.995] duration-150 transition"
                          title="Klik untuk melihat detail nota customer"
                        >
                          {/* Left Column code, customer, badges */}
                          <div className="space-y-1 text-left flex-1 min-w-0 pr-2">
                            <p className="text-[#0284C7] font-black tracking-tight text-[11px] font-mono leading-none">
                              {t.id}
                            </p>
                            <p className="text-zinc-200 font-extrabold text-[12.5px] tracking-wide truncate">
                              {t.customerName}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {/* Status Badge */}
                              <span className={`text-[8.5px] font-extrabold font-mono uppercase px-2 py-0.5 rounded-sm border ${
                                t.status === "Diambil"
                                  ? "bg-zinc-950/40 text-blue-400 border-blue-900/40"
                                  : t.status === "Selesai"
                                  ? "bg-emerald-950/20 text-emerald-400 border-emerald-900/40"
                                  : t.status === "Batal"
                                  ? "bg-red-950/20 text-rose-500 border-red-900/40"
                                  : "bg-amber-950/20 text-amber-500 border-amber-900/40"
                              }`}>
                                {t.status}
                              </span>

                              {/* Status Bayar Badge */}
                              <span className={`text-[8.5px] font-extrabold font-mono uppercase px-2 py-0.5 rounded-sm border ${
                                t.statusBayar === "Lunas"
                                  ? "bg-green-600/10 text-emerald-400 border-emerald-900/40"
                                  : t.statusBayar === "DP"
                                  ? "bg-amber-600/10 text-amber-400 border-amber-900/40"
                                  : "bg-red-600/10 text-rose-400 border-red-900/40"
                              }`}>
                                {t.statusBayar === "DP" && t.dpAmount ? `DP ${formatIDR(t.dpAmount)}` : t.statusBayar}
                              </span>
                            </div>
                          </div>

                          {/* Right Column Date, price, qty info badge */}
                          <div className="space-y-2 text-right">
                            {selectedReport?.id === "estimasi" ? (
                              <p className="text-[9.5px] text-amber-500 font-mono font-black tracking-tight uppercase">
                                ⏳ Est: {formatReportDate(t.estimasiSelesai)}
                              </p>
                            ) : selectedReport?.id === "selesai" ? (
                              <p className="text-[9.5px] text-emerald-400 font-mono font-black tracking-tight uppercase">
                                ✓ Selesai: {formatReportDate(t.tanggalSelesai || t.tanggalMasuk)}
                              </p>
                            ) : (
                              <p className="text-[9.5px] text-zinc-500 font-mono">
                                {formatReportDate(t.tanggalMasuk)}
                              </p>
                            )}
                            <p className={`text-[14.5px] font-black tracking-tight font-sans ${t.status === "Batal" ? "line-through text-zinc-600" : "text-white"}`}>
                              {formatIDR(t.totalHarga)}
                            </p>
                            <div className="inline-block bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 text-[10px] font-mono leading-none rounded-sm">
                              {qtyFormatted}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* TAB 2: PER TANGGAL - SCREENSHOT 3 */
                <div className="space-y-2 mt-2">
                  {groupedData.length === 0 ? (
                    <div className="py-12 text-center text-zinc-650 space-y-2">
                      <AlertCircle className="w-8 h-8 text-zinc-700 mx-auto" />
                      <p className="text-xs">Tidak ada data berkala dalam range waktu.</p>
                    </div>
                  ) : (
                    groupedData.map((d, index) => (
                      <div 
                        key={index} 
                        className="bg-[#121214] border border-[#27272A] p-3 flex justify-between items-start text-xs hover:border-[#0284C7] duration-155"
                      >
                        {/* Left column: Date and micro-badges metrics */}
                        <div className="space-y-2 text-left">
                          <p className="font-bold text-zinc-200 text-sm">
                            {formatIndoDate(d.date)}
                          </p>
                          <div className="flex flex-wrap gap-1 items-center">
                            {d.kg > 0 && (
                              <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[9.5px] px-2 py-0.5 leading-none">
                                {d.kg.toFixed(3).replace(".", ",")} kg
                              </span>
                            )}
                            {d.pc > 0 && (
                              <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[9.5px] px-2 py-0.5 leading-none">
                                {d.pc} pc
                              </span>
                            )}
                            {d.set > 0 && (
                              <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[9.5px] px-2 py-0.5 leading-none">
                                {d.set} set
                              </span>
                            )}
                            {d.meter > 0 && (
                              <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[9.5px] px-2 py-0.5 leading-none">
                                {d.meter.toFixed(1).replace(".", ",")} m
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right column: Sum and transcount */}
                        <div className="text-right space-y-1.5 self-center">
                          <p className="font-mono font-black text-white text-[15px]">
                            {formatIDR(d.revenue)}
                          </p>
                          <p className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider font-mono">
                            {d.count} Transaksi
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 3. FIXED SCREEN BOTTOM STICKY PANEL AS DIRECTED IN SCREENSHOTS */}
          <div className="absolute bottom-0 left-0 right-0 h-28 bg-[#121214] border-t border-[#27272A] p-4 flex flex-col justify-between select-none z-50">
            {/* Top row: Qty aggregates summary */}
            <div className="flex justify-between items-center text-[10px] tracking-wide text-zinc-400 font-black uppercase font-mono">
              <span className="truncate flex-1 text-left">
                {totals.kg.toLocaleString("id-ID", { minimumFractionDigits: 3 })} kg, {totals.pc} pc, {totals.set} set, {totals.meter.toLocaleString("id-ID", { minimumFractionDigits: 1 })} meter
              </span>
              <button 
                type="button"
                onClick={() => setShowSummaryDetails(!showSummaryDetails)}
                className="text-zinc-550 hover:text-white p-1 transition"
                title="Expand metric details"
              >
                <ChevronDown className={`w-3.5 h-3.5 transform transition ${showSummaryDetails ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Bottom row: Total amount on left, Download green button on right */}
            <div className="flex justify-between items-center mt-2 gap-3">
              <div 
                className="text-left shrink-0 cursor-pointer hover:opacity-80"
                onClick={() => setShowSummaryDetails(!showSummaryDetails)}
              >
                <p className="text-[10px] text-zinc-550 font-extrabold uppercase tracking-widest font-mono flex items-center gap-1">
                  Total ({totals.count} Transaksi)
                </p>
                <p className="text-base font-black text-[#0284C7] leading-none font-mono mt-1">
                  {formatIDR(totals.revenue)}
                </p>
              </div>

              {/* Flat Green Download button */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 bg-[#0B7C39] hover:bg-[#0B7C39]/90 active:bg-[#0B7C39]/85 text-white text-[11px] md:text-xs font-extrabold px-4 py-2.5 uppercase tracking-wider transition rounded-sm shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
            </div>

            {/* Micro-expanded metrics details */}
            {showSummaryDetails && (
              <div className="absolute bottom-28 left-0 right-0 bg-[#0C0C0E] border-t border-[#27272A] p-3 space-y-1.5 text-[10.5px] text-zinc-400 text-left">
                <p className="font-extrabold text-[#0284C7] text-xs border-b border-zinc-900 pb-1 uppercase tracking-widest">RINGKASAN REKAP DATA RAW</p>
                <div className="grid grid-cols-2 gap-x-4 py-1 font-mono">
                  <p>⚖️ Berat Timbang:</p>
                  <p className="text-right text-white font-black">{totals.kg.toLocaleString("id-ID")} kg</p>
                  <p>👕 Jumlah Pcs:</p>
                  <p className="text-right text-white font-black">{totals.pc} pcs</p>
                  <p>🛌 Jumlah Set Bedcover:</p>
                  <p className="text-right text-white font-black">{totals.set} set</p>
                  <p>🛹 Gulungan Meteran:</p>
                  <p className="text-right text-white font-black">{totals.meter.toLocaleString("id-ID")} m</p>
                  <p className="text-amber-500 font-bold">⚠️ Sisa Tagihan Unpaid:</p>
                  <p className="text-right text-amber-500 font-black font-bold">
                    {formatIDR(totalDebtAmountOnly(filteredTransactions))}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Internal util to calculate unpaid total debt inside given matching tx list
function totalDebtAmountOnly(tList: LaundryTransaction[]): number {
  return tList.filter(t => t.statusBayar !== "Lunas" && t.status !== "Batal").reduce((sum, t) => {
    const paidAmount = t.statusBayar === "DP" && t.dpAmount ? t.dpAmount : 0;
    const remaining = t.totalHarga - paidAmount;
    return sum + (remaining > 0 ? remaining : 0);
  }, 0);
}
