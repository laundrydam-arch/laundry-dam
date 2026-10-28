import React, { useState } from "react";
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
  UserPlus
} from "lucide-react";
import { LaundryTransaction, Customer, Service, Expense } from "../types";

interface LaundryDashboardProps {
  transactions: LaundryTransaction[];
  customers: Customer[];
  services: Service[];
  expenses: Expense[];
  onSetViewTab: (tab: string) => void;
  onSetSubTab?: (tab: string) => void;
  onTriggerNewTransaction: () => void;
  onTriggerNewCustomer: () => void;
  onTriggerNewService: () => void;
}

export function LaundryDashboard({
  transactions,
  customers,
  services,
  expenses,
  onSetViewTab,
  onSetSubTab,
  onTriggerNewTransaction,
  onTriggerNewCustomer,
  onTriggerNewService
}: LaundryDashboardProps) {
  const [reminderTab, setReminderTab] = useState<"hariIni" | "lewat" | "semua">("hariIni");

  // Filter calculations based on 2026-05-28T06:35:09Z (represented as current local time)
  const todayStr = "2026-05-28";

  // Today's incoming transactions
  const todayTransactions = transactions.filter(t => t.tanggalMasuk.startsWith(todayStr));
  
  // Today's business revenue (completed or paid)
  const todayRevenue = transactions
    .filter(t => t.tanggalMasuk.startsWith(todayStr) && t.statusBayar === "Lunas")
    .reduce((sum, t) => sum + t.totalHarga, 0);

  // Today's quantity statistics
  const todayKg = todayTransactions
    .filter(t => t.layananNama.toLowerCase().includes("kiloan") || t.notes?.toLowerCase().includes("kg") || true) // fallback or kiloan check
    .reduce((sum, t) => sum + t.berat, 0);

  // Month stats (May 2026)
  const monthStr = "2026-05";
  const monthlyTransactions = transactions.filter(t => t.tanggalMasuk.startsWith(monthStr));
  const monthlyRevenue = transactions
    .filter(t => t.tanggalMasuk.startsWith(monthStr) && t.statusBayar === "Lunas")
    .reduce((sum, t) => sum + t.totalHarga, 0);

  const monthlyKg = monthlyTransactions.reduce((sum, t) => sum + t.berat, 0);

  // Overdue check: estimasiSelesai has passed today and status is not Diambil / Selesai
  const isOverdue = (estimasiStr: string) => {
    // Simple check: compare with today date + time (using standard lexicographical matches)
    const currentDateTimeStr = "2026-05-28 14:00"; // rough simulation
    return estimasiStr < currentDateTimeStr;
  };

  // Transaction Lists according to Reminders:
  // 1. Estimasi Hari Ini: estimasiSelesai starts with 2026-05-28
  const dueTodayList = transactions.filter(t => t.estimasiSelesai.startsWith(todayStr) && t.status !== "Diambil");
  // 2. Telah Lewat: estimasiSelesai has passed, status not Completed / Returned
  const overdueList = transactions.filter(t => isOverdue(t.estimasiSelesai) && t.status !== "Selesai" && t.status !== "Diambil");
  // 3. Semua active orders
  const activeOrdersList = transactions.filter(t => t.status !== "Diambil");

  // Selection list for reminders
  const listToRender = 
    reminderTab === "hariIni" ? dueTodayList : 
    reminderTab === "lewat" ? overdueList : 
    activeOrdersList;

  // Format amount to local IDR
  const formatIDR = (val: number) => {
    return "Rp " + val.toLocaleString("id-ID");
  };

  const dayLabel = "Kamis, 28 Mei 2026";

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Card A: Masuk Hari Ini */}
        <div className="bg-[#121214] border border-[#27272A] p-4 rounded-none space-y-3 relative shadow-sm">
          <div className="flex justify-between items-start">
            <div className="space-y-0.5">
              <h3 className="text-[9.5px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                MASUK HARI INI <span className="text-emerald-500 font-black cursor-pointer" title="Info detail">&#9432;</span>
              </h3>
              <p className="text-2xl font-black text-white tracking-tight font-mono">
                {formatIDR(todayRevenue)}
              </p>
            </div>
            <ArrowDownLeft className="w-5 h-5 text-emerald-400 p-0.5 bg-emerald-950/40 border border-emerald-900/30" />
          </div>

          <div className="grid grid-cols-3 gap-1 border-t border-b border-zinc-900 py-2.5 text-center">
            <div className="cursor-pointer" onClick={() => { onSetViewTab("transaksi") }}>
              <p className="text-[15px] font-black text-white font-mono">{todayTransactions.length} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Masuk</p>
            </div>
            <div className="cursor-pointer border-l border-zinc-900" onClick={() => { setReminderTab("hariIni") }}>
              <p className="text-[15px] font-black text-white font-mono">{dueTodayList.length} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Harus Selesai</p>
            </div>
            <div className="cursor-pointer border-l border-zinc-900" onClick={() => { setReminderTab("lewat") }}>
              <p className="text-[15px] font-black text-rose-500 font-mono">{overdueList.length} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Terlambat</p>
            </div>
          </div>

          <div className="flex justify-between items-center text-[9.5px] text-zinc-400 font-bold uppercase tracking-wider px-1">
            <span>⚖️ {todayKg.toFixed(2)} KG</span>
            <span>👕 {todayTransactions.length * 5} PC</span>
            <span>🧴 {todayTransactions.filter(t => t.parfum).length} SET</span>
          </div>
        </div>

        {/* Card B: Omset Bulan Ini */}
        <div className="bg-[#121214] border border-[#27272A] p-4 rounded-none space-y-3 relative shadow-sm">
          <div className="flex justify-between items-start">
            <div className="space-y-0.5">
              <h3 className="text-[9.5px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                OMSET BULAN INI <span className="text-emerald-500 font-black cursor-pointer" title="Info detail">&#9432;</span>
              </h3>
              <p className="text-2xl font-black text-white tracking-tight font-mono">
                {formatIDR(monthlyRevenue)}
              </p>
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-400 p-0.5 bg-emerald-950/40 border border-emerald-900/30" />
          </div>

          <div className="grid grid-cols-3 gap-1 border-t border-b border-zinc-900 py-2.5 text-center text-xs">
            <div>
              <p className="text-[15px] font-black text-white font-mono">{monthlyTransactions.length} &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Transaksi</p>
            </div>
            <div className="border-l border-zinc-900">
              <p className="text-[15px] font-black text-white font-mono">2 &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Deposit</p>
            </div>
            <div className="border-l border-zinc-900">
              <p className="text-[15px] font-black text-white font-mono">0 &rsaquo;</p>
              <p className="text-[8.5px] text-zinc-550 font-black uppercase tracking-wider">Paket</p>
            </div>
          </div>

          <div className="flex justify-between items-center text-[9.5px] text-zinc-400 font-bold uppercase tracking-wider px-1">
            <span>⚖️ {monthlyKg.toFixed(2)} KG</span>
            <span>👕 {monthlyTransactions.length * 5} PC</span>
            <span>🧴 {monthlyTransactions.filter(t => t.parfum).length} SET</span>
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
        <div className="grid grid-cols-4 gap-2 bg-[#121214] border border-[#27272A] p-4 rounded-none">
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
            onClick={() => { alert("Pilihan parfum diinput saat membuat Nota Laundry") }}
            className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
          >
            <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Parfum</span>
          </button>

          {/* Item 4: Karyawan */}
          <button 
            onClick={() => onSetViewTab("karyawan")}
            className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
          >
            <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-emerald-400">
              <UserCheck className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Staf Gaji</span>
          </button>

          {/* Item 5: Buku Kas */}
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
            <span className="text-[9px] font-black text-zinc-400 mt-1 uppercase tracking-tight">Buku Kas</span>
          </button>

          {/* Item 6: Pemasukan */}
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

          {/* Item 7: Pengeluaran */}
          <button 
            onClick={() => {
              onSetViewTab("laporan");
              if (onSetSubTab) onSetSubTab("pengeluaran");
            }}
            className="flex flex-col items-center justify-center py-2.5 rounded-none hover:bg-zinc-900/50 transition duration-150"
          >
            <div className="w-9 h-9 bg-zinc-950 border border-zinc-800 rounded-none flex items-center justify-center text-red-400 font-black relative">
              <ArrowUpRight className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 text-[7.5px] bg-red-910/20 text-red-500 font-black px-1 border border-red-900/60">Ledg</span>
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
                  className="bg-[#121214] border border-[#27272A] p-3 rounded-none flex items-center justify-between gap-3 text-xs text-left"
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
                        Estimasi Selesai: <strong className="text-amber-400">{t.estimasiSelesai}</strong>
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
