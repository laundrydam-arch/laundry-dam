import React, { useState, useMemo } from "react";
import { 
  Users, 
  Settings, 
  Package, 
  UserCheck, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  Calendar, 
  Plus, 
  Receipt,
  Sparkles,
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  UserPlus,
  Bell
} from "lucide-react";
import { LaundryTransaction, Customer, Service, Expense, Reminder } from "../types";

export const formatTanggal = (dateStr?: string): string => {
  if (!dateStr) return "";
  const cleaned = dateStr.trim();
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (match) {
    const [_, year, month, day, rest] = match;
    const timePart = rest.replace("T", " ").trim();
    return `${day}-${month}-${year}${timePart ? " " + timePart : ""}`;
  }
  return dateStr;
};

interface LaundryDashboardProps {
  transactions: LaundryTransaction[];
  customers: Customer[];
  services: Service[];
  expenses: Expense[];
  reminders?: Reminder[];
  onSetViewTab: (tab: string) => void;
  onSetSubTab?: (tab: string) => void;
  onTriggerNewTransaction: () => void;
  onTriggerNewCustomer: () => void;
  onTriggerNewService: () => void;
  onTriggerParfum?: () => void;
  onViewIncomingToday?: () => void;
  onViewDueToday?: () => void;
  onViewOverdue?: () => void;
  onSelectTransactionDetail?: (id: string) => void;
  onViewMonthlyPaid?: () => void;
  onViewMonthlyDp?: () => void;
  onViewMonthlyPaket?: () => void;
  onViewAllDebt?: (subType?: "semua" | "dp" | "belumLunas") => void;
  isAdmin?: boolean;
}

export function LaundryDashboard({
  transactions,
  customers,
  services,
  expenses,
  reminders = [],
  onSetViewTab,
  onSetSubTab,
  onTriggerNewTransaction,
  onTriggerNewCustomer,
  onTriggerNewService,
  onTriggerParfum,
  onViewIncomingToday,
  onViewDueToday,
  onViewOverdue,
  onSelectTransactionDetail,
  onViewMonthlyPaid,
  onViewMonthlyDp,
  onViewMonthlyPaket,
  onViewAllDebt,
  isAdmin
}: LaundryDashboardProps) {
  const [reminderTab, setReminderTab] = useState<"hariIni" | "lewat" | "semua">("hariIni");

  // Dynamically determine today's local date in YYYY-MM-DD
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  // Helper parser to calculate true total kilograms, total pieces, total meters & total sets
  const calculateTrxTotals = (trxList: LaundryTransaction[]) => {
    let kgTotal = 0;
    let pcsTotal = 0;
    let mTotal = 0;
    let setTotal = 0;

    trxList.forEach(t => {
      // If of bracketed format: "Layanan A (2.5 Kg), Layanan B (3 Pcs)"
      if (t.layananNama.includes("(")) {
        const items = t.layananNama.split(", ");
        let matchedAny = false;

        items.forEach(item => {
          const match = item.match(/^(.*?)\s*\(([\d.]+)\s*([a-zA-Z0-9]+)\)$/i);
          if (match) {
            const nama = match[1].trim();
            const value = parseFloat(match[2].replace(",", ".")) || 0;
            const unitSaved = match[3].toLowerCase();

            // Find matching service structure to check correct type
            const foundS = services.find(s => s.nama.toLowerCase() === nama.toLowerCase());
            const realTipe = foundS ? foundS.tipe.toLowerCase() : "";

            if (realTipe === "meter" || realTipe.includes("meter") || realTipe === "m" || realTipe === "m2") {
              mTotal += value;
              matchedAny = true;
            } else if (realTipe === "set" || realTipe.includes("set")) {
              setTotal += value;
              matchedAny = true;
            } else if (realTipe.includes("satuan") || realTipe.includes("pcs") || realTipe.includes("pc")) {
              pcsTotal += value;
              matchedAny = true;
            } else if (realTipe.includes("kiloan") || realTipe.includes("kg")) {
              kgTotal += value;
              matchedAny = true;
            } else {
              // Guess based on unitSaved or service name
              if (nama.toLowerCase().includes("karpet")) {
                mTotal += value;
              } else if (unitSaved.includes("kg")) {
                kgTotal += value;
              } else if (unitSaved.includes("set")) {
                setTotal += value;
              } else if (unitSaved.includes("pcs") || unitSaved.includes("pc") || unitSaved.includes("satuan")) {
                pcsTotal += value;
              } else if (unitSaved === "m" || unitSaved.includes("meter")) {
                mTotal += value;
              } else {
                kgTotal += value;
              }
              matchedAny = true;
            }
          }
        });
        
        if (!matchedAny) {
          const nameLower = t.layananNama.toLowerCase();
          if (nameLower.includes("karpet")) {
            mTotal += t.berat;
          } else if (nameLower.includes("set")) {
            setTotal += t.berat;
          } else if (nameLower.includes("pcs") || nameLower.includes("pc")) {
            pcsTotal += t.berat;
          } else if (nameLower.includes("meter") || nameLower.includes(" m") || nameLower.endsWith(" m") || nameLower.includes(" m2")) {
            mTotal += t.berat;
          } else {
            kgTotal += t.berat;
          }
        }
      } else {
        // Single service: lookup service to see if Kiloan, Satuan, Meter, or Set
        const foundS = services.find(s => s.id === t.layananId || s.nama.toLowerCase() === t.layananNama.toLowerCase());
        if (foundS) {
          const tipeS = foundS.tipe.toLowerCase();
          if (tipeS === "meter" || tipeS.includes("meter") || tipeS === "m" || tipeS === "m2") {
            mTotal += t.berat;
          } else if (tipeS === "set" || tipeS.includes("set")) {
            setTotal += t.berat;
          } else if (tipeS.includes("satuan") || tipeS.includes("pcs") || tipeS.includes("pc")) {
            pcsTotal += t.berat;
          } else {
            kgTotal += t.berat;
          }
        } else {
          // Fallbacks based on notes / names
          const nameLower = t.layananNama.toLowerCase();
          const notesLower = (t.notes || "").toLowerCase();
          if (nameLower.includes("karpet")) {
            if (nameLower.includes("pcs") || nameLower.includes("pc") || nameLower.includes("satuan")) {
              pcsTotal += t.berat;
            } else if (nameLower.includes("set")) {
              setTotal += t.berat;
            } else {
              mTotal += t.berat;
            }
          } else if (nameLower.includes("set")) {
            setTotal += t.berat;
          } else if (nameLower.includes("kilo") || notesLower.includes("kg")) {
            kgTotal += t.berat;
          } else if (nameLower.includes("satuan") || nameLower.includes("pcs") || nameLower.includes("pc")) {
            pcsTotal += t.berat;
          } else if (nameLower.includes("meter") || nameLower.includes(" m") || nameLower.endsWith(" m") || nameLower.includes(" m2")) {
            mTotal += t.berat;
          } else {
            kgTotal += t.berat; // Default fallback to weight
          }
        }
      }
    });

    return { kg: kgTotal, pcs: pcsTotal, m: mTotal, set: setTotal };
  };

  // Overdue check: estimasiSelesai has passed today and status is not Diambil / Selesai
  const isOverdue = (estimasiStr: string) => {
    const now = new Date();
    const currentDateTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return estimasiStr < currentDateTimeStr;
  };

  // Today's incoming transactions & Revenue memoized
  const { todayTransactions, todayRevenue, todayTotalsResult } = useMemo(() => {
    const filtered = transactions.filter(t => t.tanggalMasuk.startsWith(todayStr));
    const revenue = filtered.reduce((sum, t) => sum + t.totalHarga, 0);
    const totals = calculateTrxTotals(filtered);
    return { todayTransactions: filtered, todayRevenue: revenue, todayTotalsResult: totals };
  }, [transactions, todayStr]);

  const todayKg = todayTotalsResult.kg;
  const todayPcs = todayTotalsResult.pcs;
  const todayM = todayTotalsResult.m;
  const todaySet = todayTotalsResult.set;

  // Month stats memoized (only count fully paid Lunas transactions)
  const { monthlyTransactions, monthlyRevenue, monthlyTotalsResult, monthlyDpCount, monthlyPaketCount } = useMemo(() => {
    const list = transactions.filter(t => t.tanggalMasuk.startsWith(monthStr) && t.statusBayar === "Lunas");
    const rev = list.reduce((sum, t) => sum + t.totalHarga, 0);
    const totals = calculateTrxTotals(list);
    const dpCount = transactions.filter(t => t.tanggalMasuk.startsWith(monthStr) && t.statusBayar === "DP").length;
    const paketCount = list.filter(t => t.notes && t.notes.includes("[TRANSAKSI PAKET]")).length;
    return {
      monthlyTransactions: list,
      monthlyRevenue: rev,
      monthlyTotalsResult: totals,
      monthlyDpCount: dpCount,
      monthlyPaketCount: paketCount
    };
  }, [transactions, monthStr]);

  const monthlyKg = monthlyTotalsResult.kg;
  const monthlyPcs = monthlyTotalsResult.pcs;
  const monthlyM = monthlyTotalsResult.m;
  const monthlySet = monthlyTotalsResult.set;

  // Total Hutang memoized (Unpaid / Partial DP transactions, excluding cancelled/Batal)
  const { unpaidTransactions, totalDebt } = useMemo(() => {
    const unpaid = transactions.filter(t => t.statusBayar !== "Lunas" && t.status !== "Batal");
    const debt = unpaid.reduce((sum, t) => {
      const paidAmount = t.statusBayar === "DP" && t.dpAmount ? t.dpAmount : 0;
      const remaining = t.totalHarga - paidAmount;
      return sum + (remaining > 0 ? remaining : 0);
    }, 0);
    return { unpaidTransactions: unpaid, totalDebt: debt };
  }, [transactions]);

  // Transaction Lists according to Reminders memoized:
  const { dueTodayList, overdueList, activeOrdersList } = useMemo(() => {
    const dueToday = transactions.filter(t => t.estimasiSelesai.startsWith(todayStr) && t.status !== "Diambil");
    const overdue = transactions.filter(t => isOverdue(t.estimasiSelesai) && t.status !== "Selesai" && t.status !== "Diambil");
    const activeOrders = transactions.filter(t => t.status !== "Diambil");
    return { dueTodayList: dueToday, overdueList: overdue, activeOrdersList: activeOrders };
  }, [transactions, todayStr]);

  // Selection list for reminders
  const listToRender = 
    reminderTab === "hariIni" ? dueTodayList : 
    reminderTab === "lewat" ? overdueList : 
    activeOrdersList;

  // Format amount to local IDR
  const formatIDR = (val: number) => {
    return "Rp " + val.toLocaleString("id-ID");
  };

  // Formatted display name for header
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const dayLabel = `${dayNames[today.getDay()]}, ${today.getDate()} ${monthNames[today.getMonth()]} ${today.getFullYear()}`;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#0A0A0B] text-zinc-100 animate-fade-in font-sans">
      
      {/* 1. Shop Premium Header Banner */}
      <div className="flex items-center justify-between pb-1 border-b border-zinc-900">
        <div className="text-left">
          <div className="flex items-center gap-1.5 cursor-pointer">
            <h1 className="text-lg font-black text-white tracking-tight uppercase flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-none inline-block duration-1000 animate-pulse" />
              Damdam Laundry
            </h1>
            <span className="text-[10px] text-zinc-500 font-extrabold">&or;</span>
          </div>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{dayLabel}</p>
        </div>

        <button 
          onClick={onTriggerNewTransaction}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-150 transition-all shadow-md active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3px]" />
          Nota Baru
        </button>
      </div>

      {/* 2. STATS CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card A: Masuk Hari Ini */}
        <div className="bg-[#121214] border border-[#27272A] p-4 rounded-none space-y-3 relative shadow-sm">
          <div className="flex justify-between items-start">
            <div 
              className="space-y-0.5 cursor-pointer group"
              onClick={() => onViewIncomingToday?.()}
              title="Klik untuk melihat daftar nota masuk hari ini saja"
            >
              <h3 className="text-[9.5px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1 group-hover:text-emerald-400 duration-155">
                MASUK HARI INI <span className="text-emerald-500 font-black" title="Info detail">&#9432;</span>
              </h3>
              <p className="text-2xl font-black text-white tracking-tight font-mono group-hover:text-emerald-450">
                {formatIDR(todayRevenue)}
              </p>
            </div>
            <ArrowDownLeft 
              onClick={() => onViewIncomingToday?.()}
              className="w-5 h-5 text-emerald-400 p-0.5 bg-emerald-950/40 border border-emerald-900/30 cursor-pointer hover:bg-emerald-900/50" 
              title="Klik untuk melihat daftar nota masuk hari ini saja"
            />
          </div>

          <div className="grid grid-cols-3 gap-1 border-t border-b border-zinc-900 py-2.5 text-center">
            <div className="cursor-pointer hover:bg-zinc-900/30 py-1 transition" onClick={() => { onViewIncomingToday ? onViewIncomingToday() : onSetViewTab("transaksi") }}>
              <p className="text-[15px] font-black text-white font-mono">{todayTransactions.length} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Masuk</p>
            </div>
            <div 
              className="cursor-pointer border-l border-zinc-900 hover:bg-zinc-900/30 py-1 transition" 
              onClick={() => { 
                setReminderTab("hariIni");
                onViewDueToday?.();
              }}
              title="Klik untuk melihat daftar nota yang harus selesai hari ini"
            >
              <p className="text-[15px] font-black text-white font-mono">{dueTodayList.length} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Harus Selesai</p>
            </div>
            <div 
              className="cursor-pointer border-l border-zinc-900 hover:bg-zinc-900/30 py-1 transition" 
              onClick={() => { 
                setReminderTab("lewat");
                onViewOverdue?.();
              }}
              title="Klik untuk melihat daftar nota terlambat"
            >
              <p className="text-[15px] font-black text-rose-500 font-mono">{overdueList.length} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Terlambat</p>
            </div>
          </div>

          <div className="flex justify-between items-center text-[9.5px] text-zinc-400 font-bold uppercase tracking-wider px-1 flex-wrap gap-1 font-mono">
            <span>⚖️ {todayKg.toFixed(2)} KG</span>
            <span>👕 {todayPcs} PCS</span>
            <span>📏 {todayM} M</span>
            <span>📦 {todaySet} SET</span>
            <span>🧴 {todayTransactions.filter(t => t.parfum && t.parfum.toLowerCase() !== "polos").length} BTL</span>
          </div>
        </div>

        {/* Card B: Omset Bulan Ini */}
        <div className="bg-[#121214] border border-[#27272A] p-4 rounded-none space-y-3 relative shadow-sm">
          <div className="flex justify-between items-start">
            <div 
              className="space-y-0.5 cursor-pointer group"
              onClick={() => onViewMonthlyPaid?.()}
              title="Klik untuk melihat transaksi lunas bulan ini"
            >
              <h3 className="text-[9.5px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1 group-hover:text-emerald-400 duration-155">
                OMSET BULAN INI <span className="text-emerald-500 font-black" title="Info detail">&#9432;</span>
              </h3>
              <p className="text-2xl font-black text-white tracking-tight font-mono group-hover:text-emerald-450">
                {formatIDR(monthlyRevenue)}
              </p>
            </div>
            <TrendingUp 
              onClick={() => onViewMonthlyPaid?.()}
              className="w-5 h-5 text-emerald-400 p-0.5 bg-emerald-950/40 border border-emerald-900/30 cursor-pointer hover:bg-emerald-900/50" 
              title="Klik untuk melihat transaksi lunas bulan ini"
            />
          </div>

          <div className="grid grid-cols-3 gap-1 border-t border-b border-zinc-900 py-2.5 text-center text-xs">
            <div 
              className="cursor-pointer hover:bg-zinc-900/30 py-1 transition"
              onClick={() => onViewMonthlyPaid?.()}
              title="Klik untuk melihat transaksi terbayar lunas bulan ini"
            >
              <p className="text-[15px] font-black text-white font-mono">{monthlyTransactions.length} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Transaksi</p>
            </div>
            <div 
              className="cursor-pointer border-l border-zinc-900 hover:bg-zinc-900/30 py-1 transition"
              onClick={() => onViewMonthlyDp?.()}
              title="Klik untuk melihat transaksi DP bulan ini"
            >
              <p className="text-[15px] font-black text-white font-mono">{monthlyDpCount} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Deposit</p>
            </div>
            <div 
              className="cursor-pointer border-l border-zinc-900 hover:bg-zinc-900/30 py-1 transition"
              onClick={() => onViewMonthlyPaket?.()}
              title="Klik untuk melihat transaksi paket bulan ini"
            >
              <p className="text-[15px] font-black text-white font-mono">{monthlyPaketCount} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Paket</p>
            </div>
          </div>

          <div className="flex justify-between items-center text-[9.5px] text-zinc-400 font-bold uppercase tracking-wider px-1 flex-wrap gap-1 font-mono">
            <span>⚖️ {monthlyKg.toFixed(2)} KG</span>
            <span>👕 {monthlyPcs} PCS</span>
            <span>📏 {monthlyM} M</span>
            <span>📦 {monthlySet} SET</span>
            <span>🧴 {monthlyTransactions.filter(t => t.parfum && t.parfum.toLowerCase() !== "polos").length} BTL</span>
          </div>
        </div>

        {/* Card C: Total Hutang Belum Lunas */}
        <div className="bg-[#121214] border border-[#27272A] p-4 rounded-none space-y-3 relative shadow-sm">
          <div className="flex justify-between items-start">
            <div 
              className="space-y-0.5 cursor-pointer group"
              onClick={() => onViewAllDebt?.("semua")}
              title="Klik untuk melihat piutang / transaksi yang belum lunas"
            >
              <h3 className="text-[9.5px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1 group-hover:text-amber-400 duration-155">
                TOTAL HUTANG PIUTANG <span className="text-amber-500 font-black" title="Info detail">&#9432;</span>
              </h3>
              <p className="text-2xl font-black text-amber-500 tracking-tight font-mono group-hover:text-amber-450">
                {formatIDR(totalDebt)}
              </p>
            </div>
            <AlertTriangle 
              onClick={() => onViewAllDebt?.("semua")}
              className="w-5 h-5 text-amber-500 p-0.5 bg-amber-955/40 border border-amber-900/30 cursor-pointer hover:bg-amber-900/50" 
              title="Klik untuk melihat piutang / transaksi yang belum lunas"
            />
          </div>

          <div className="grid grid-cols-2 gap-1 border-t border-b border-zinc-900 py-2.5 text-center text-xs">
            <div 
              className="cursor-pointer hover:bg-zinc-900/30 py-1 transition"
              onClick={() => onViewAllDebt?.("belumLunas")}
              title="Klik untuk melihat transaksi belum bayar sama sekali"
            >
              <p className="text-[15px] font-black text-rose-500 font-mono">{unpaidTransactions.filter(t => t.statusBayar === "Belum Lunas").length} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider font-sans">Belum Lunas</p>
            </div>
            <div 
              className="cursor-pointer border-l border-zinc-900 hover:bg-zinc-900/30 py-1 transition"
              onClick={() => onViewAllDebt?.("dp")}
              title="Klik untuk melihat transaksi dengan status Panjar / DP"
            >
              <p className="text-[15px] font-black text-amber-400 font-mono">{unpaidTransactions.filter(t => t.statusBayar === "DP").length} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider font-sans">DP (Sisa Tagihan)</p>
            </div>
          </div>

          <div className="text-center font-mono text-[9px] text-zinc-500 uppercase tracking-wide">
            ⚠️ {unpaidTransactions.length} Nota Outstandings belum lunas
          </div>
        </div>
      </div>

      <p className="text-[8.5px] text-zinc-500 font-bold tracking-wider uppercase text-left">
        * Data diperbarui otomatis &bull; Tersinkronisasi Cloud Server
      </p>

      {/* 3. OPERATIONAL GRID ICON MENU */}
      <div className="space-y-2">
        <h4 className="text-[9.5px] font-black text-zinc-400 uppercase tracking-widest text-left pl-1">
          Menu Utama Laundry
        </h4>
        <div className={`grid gap-2 bg-[#121214] border border-[#27272A] p-4 rounded-none ${isAdmin ? "grid-cols-5" : "grid-cols-4"}`}>
          {/* Item 1: Pelanggan */}
          <button 
            onClick={onTriggerNewCustomer}
            className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
          >
            <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-emerald-400 relative">
              <Users className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 text-[7px] bg-emerald-950 text-emerald-400 font-black px-1 border border-emerald-900">{customers.length}</span>
            </div>
            <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Pelanggan</span>
          </button>

          {/* Item 2: Layanan */}
          <button 
            onClick={onTriggerNewService}
            className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
          >
            <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-emerald-400 relative">
              <Package className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 text-[7px] bg-emerald-950 text-emerald-400 font-black px-1 border border-emerald-900">{services.length}</span>
            </div>
            <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Layanan</span>
          </button>

          {/* Item 3: Parfum */}
          <button 
            onClick={() => {
              if (onTriggerParfum) {
                onTriggerParfum();
              }
            }}
            className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
          >
            <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Parfum</span>
          </button>

          {/* Item 4: Karyawan */}
          {!isAdmin && (
            <button 
              onClick={() => onSetViewTab("karyawan")}
              className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
            >
              <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-emerald-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Staf Gaji</span>
            </button>
          )}

          {/* Item 5: Buku Kas */}
          {!isAdmin && (
            <button 
              onClick={() => {
                onSetViewTab("laporan");
                if (onSetSubTab) onSetSubTab("bukukas");
              }}
              className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
            >
              <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-amber-500 font-black relative">
                <BookOpen className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 text-[7.5px] bg-amber-950 text-amber-500 font-black px-1 border border-amber-900">Pro</span>
              </div>
              <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight font-sans">Buku Kas</span>
            </button>
          )}

          {/* Item 6: Pemasukan */}
          {!isAdmin && (
            <button 
              onClick={() => {
                onSetViewTab("laporan");
                if (onSetSubTab) onSetSubTab("pemasukan");
              }}
              className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
            >
              <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-emerald-400 font-black relative">
                <Receipt className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 text-[7.5px] bg-emerald-950 text-emerald-400 font-black px-1 border border-emerald-900">Pro</span>
              </div>
              <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Pemasukan</span>
            </button>
          )}

          {/* Item 7: Pengeluaran */}
          <button 
            onClick={() => {
              if (onSetSubTab) {
                onSetSubTab("pengeluaran");
              } else {
                onSetViewTab("pengeluaran");
              }
            }}
            className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
          >
            <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-red-400 font-black relative">
              <ArrowUpRight className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 text-[7.5px] bg-red-910/20 text-red-500 font-black px-1 border border-red-900/60 font-sans">Ledg</span>
            </div>
            <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Pengeluaran</span>
          </button>

          {/* Item 8: Transaksi */}
          <button 
            onClick={() => onSetViewTab("transaksi")}
            className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
          >
            <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-emerald-400">
              <Receipt className="w-4 h-4 text-emerald-500" />
            </div>
            <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Nota</span>
          </button>

          {/* Item 9: Pengingat Tagihan */}
          {!isAdmin && (
            <button 
              onClick={() => onSetSubTab && onSetSubTab("pengingat")}
              className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
            >
              <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-rose-400 relative">
                <Bell className="w-4 h-4 animate-swing" />
                {reminders && reminders.filter(r => !r.isPaid && r.dueDate <= new Date().toISOString().split("T")[0]).length > 0 && (
                  <span className="absolute -top-1 -right-1 text-[7.5px] bg-red-600 text-white font-black px-1 border border-red-900 animate-pulse">!</span>
                )}
              </div>
              <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Pengingat</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. REMINDERS (PENDING ACTIONS) BAR */}
      <div className="space-y-2">
        <h4 className="text-[9.5px] font-black text-zinc-400 uppercase tracking-widest text-left pl-1 flex items-center justify-between">
          <span>🔔 PENGINGAT ESTIMASI SELESAI ({reminderTab === "hariIni" ? dueTodayList.length : reminderTab === "lewat" ? overdueList.length : activeOrdersList.length})</span>
          <button onClick={() => onSetViewTab("transaksi")} className="text-[8.5px] text-emerald-400 lowercase hover:underline font-bold">lihat semua &rsaquo;</button>
        </h4>

        {/* Filter sub tabs */}
        <div className="flex bg-[#121214] border border-[#27272A] p-0.5 text-[8.5px] font-black uppercase tracking-wider">
          <button
            onClick={() => setReminderTab("hariIni")}
            className={`flex-1 py-1.5 cursor-pointer text-center ${
              reminderTab === "hariIni" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
            }`}
          >
            Estimasi Hari Ini ({dueTodayList.length})
          </button>
          <button
            onClick={() => setReminderTab("lewat")}
            className={`flex-1 py-1.5 cursor-pointer text-center border-l border-zinc-800/80 ${
              reminderTab === "lewat" ? "bg-[#C2410C] text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            Telah Lewat ({overdueList.length})
          </button>
          <button
            onClick={() => setReminderTab("semua")}
            className={`flex-1 py-1.5 cursor-pointer text-center border-l border-zinc-800/80 ${
              reminderTab === "semua" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            Semua Antrian ({activeOrdersList.length})
          </button>
        </div>

        {/* List render */}
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {listToRender.length === 0 ? (
            <div className="py-6 text-center border border-zinc-900 bg-zinc-950/40 text-zinc-550 text-[10px] font-black uppercase tracking-wider">
              👍 Tidak ada antrian transaksi di kategori ini!
            </div>
          ) : (
            listToRender.map((t) => {
              const statusColorMap = {
                "Antrian": "bg-[#18181B] text-[#e4e4e7] border-[#27272A] text-zinc-400",
                "Proses": "bg-[#1e1b4b] text-[#818cf8] border-[#312e81]",
                "Selesai": "bg-[#062419] text-emerald-400 border-emerald-900/60",
                "Diambil": "bg-zinc-900 text-zinc-500 border-zinc-800",
                "Batal": "bg-[#1c0f0f] text-rose-500 border-red-950/40"
              };

              return (
                <div 
                  key={t.id} 
                  className="bg-[#121214] border border-[#27272A] p-3 rounded-none flex items-center justify-between gap-3 text-xs text-left cursor-pointer hover:bg-zinc-900/40 hover:border-zinc-700 transition duration-155 group"
                  onClick={() => onSelectTransactionDetail?.(t.id)}
                  title="Klik untuk mengecek detail di dalam nota ini"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[9px] text-[#10B981] font-black border border-emerald-950 bg-emerald-950/25 px-1.5 py-0.2">
                        {t.id}
                      </span>
                      <strong className="text-white text-[11px] font-extrabold truncate max-w-[120px]">{t.customerName}</strong>
                      <span className={`text-[7.5px] font-black px-1.5 py-0.2 border rounded-none uppercase tracking-widest font-mono ${statusColorMap[t.status] || "bg-zinc-800"}`}>
                        {t.status}
                      </span>
                    </div>

                    <div className="flex flex-col text-[8.5px] text-zinc-400 font-medium space-y-0.5 font-mono">
                      <span>Layanan: <strong className="text-zinc-200">{t.layananNama} &bull; {t.berat} Kg</strong></span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-zinc-500" />
                        Estimasi Selesai: <strong className="text-amber-400">{formatTanggal(t.estimasiSelesai)}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    <span className="block font-mono font-bold text-white text-xs">
                      {formatIDR(t.totalHarga)}
                    </span>
                    <span className={`inline-block text-[7.5px] font-black px-1.5 py-0.5 rounded-none font-mono ${t.statusBayar === "Lunas" ? "bg-emerald-950/30 text-emerald-400 border border-emerald-900/50" : "bg-red-950/30 text-rose-500 border border-red-900/40"}`}>
                      {t.statusBayar.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
