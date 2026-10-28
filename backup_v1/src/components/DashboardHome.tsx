import React, { useState } from "react";
import { TrendingUp, ArrowRight, Calendar, Download, Sparkles } from "lucide-react";
import { Expense, CategorySpec } from "../types";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface DashboardHomeProps {
  expenses: Expense[];
  budgetLimit: number;
  categories: Record<string, CategorySpec>;
  onSetViewTab: (tab: string) => void;
  onSetBudgetLimit: (limit: number) => void;
  onResetToEmpty: () => void;
  onLoadSampleData: () => void;
}

export function DashboardHome({ 
  expenses, 
  budgetLimit, 
  categories, 
  onSetViewTab, 
  onSetBudgetLimit,
  onResetToEmpty,
  onLoadSampleData
}: DashboardHomeProps) {
  // Period filter states: "Semua", "YYYY-MM", or "custom"
  const [selectedPeriod, setSelectedPeriod] = useState<string>("Semua");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  const [timeframe, setTimeframe] = useState<"Semua" | "7Hari" | "30Hari">("Semua");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Format month YYYY-MM to Indonesian Month Year label
  const formatMonthLabel = (mStr: string) => {
    if (!mStr || mStr === "Semua") return "Semua Periode";
    const [year, month] = mStr.split("-");
    const monthNames = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const mIndex = parseInt(month, 10) - 1;
    return `${monthNames[mIndex] || month} ${year}`;
  };

  // Generate dynamic list of available months from transactions
  const currentMonthStr = new Date().toISOString().substring(0, 7); // "2026-05"
  const monthList = Array.from(
    new Set([
      currentMonthStr,
      ...expenses.map(e => e.date.substring(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m))
    ])
  ).sort().reverse();

  // Filter expenses list first according to month selection or custom dates
  const filteredExpenses = expenses.filter(e => {
    if (selectedPeriod === "Semua") {
      return true;
    }
    if (selectedPeriod === "custom") {
      if (!startDate && !endDate) return true;
      const eDate = e.date; // "YYYY-MM-DD"
      if (startDate && eDate < startDate) return false;
      if (endDate && eDate > endDate) return false;
      return true;
    }
    // "YYYY-MM"
    return e.date.startsWith(selectedPeriod);
  });

  // Calculate stats on filtered subset
  const totalExpense = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Find single largest transaction on filtered subset
  const largestExpense = filteredExpenses.length > 0 
    ? filteredExpenses.reduce((max, exp) => exp.amount > max.amount ? exp : max, filteredExpenses[0])
    : null;

  // Find biggest category spending on filtered subset
  const categorySums: Record<string, number> = {};
  filteredExpenses.forEach(e => {
    categorySums[e.category] = (categorySums[e.category] || 0) + e.amount;
  });

  // Find highest category name with spending
  const highestCategoryName = Object.entries(categorySums).reduce((maxCat, [catName, amount]) => {
    const maxAmount = categorySums[maxCat] || 0;
    return amount > maxAmount ? catName : maxCat;
  }, "");

  // Export report to CSV for filtered subset
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      alert("Tidak ada data transaksi di periode ini untuk diekspor.");
      return;
    }
    
    // Create CSV Content
    let csvContent = "";
    // CSV Header with BOM for better Excel compatibility
    csvContent += "\uFEFF"; 
    csvContent += "Tanggal,Kategori,Sub-Kategori,Deskripsi Pengeluaran,Metode Pembayaran,Jumlah (Rp),Catatan\n";
    
    filteredExpenses.forEach(e => {
      const row = [
        e.date,
        `"${e.category.replace(/"/g, '""')}"`,
        e.subCategory ? `"${e.subCategory.replace(/"/g, '""')}"` : '""',
        `"${e.title.replace(/"/g, '""')}"`,
        e.paymentMethod,
        e.amount,
        e.notes ? `"${e.notes.replace(/"/g, '""')}"` : ""
      ].join(",");
      csvContent += row + "\n";
    });
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    let periodName = "Semua";
    if (selectedPeriod === "custom") {
      periodName = `Kustom_${startDate || 'Awal'}_s.d_${endDate || 'Akhir'}`;
    } else if (selectedPeriod !== "Semua") {
      periodName = selectedPeriod;
    }
    
    link.setAttribute("download", `DamdamLaundry_Laporan_Operasional_${periodName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate dynamic timeframe based chart data
  const filteredForChart = filteredExpenses.filter(e => {
    if (timeframe === "Semua") return true;
    const expDate = new Date(e.date);
    if (isNaN(expDate.getTime())) return true;
    const diffTime = Math.abs(new Date().getTime() - expDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (timeframe === "7Hari") return diffDays <= 7;
    if (timeframe === "30Hari") return diffDays <= 30;
    return true;
  });

  // Group elements by date and sort
  const dateMap: Record<string, number> = {};
  filteredForChart.forEach(e => {
    const dateObj = new Date(e.date);
    const label = isNaN(dateObj.getTime()) ? e.date : `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
    dateMap[label] = (dateMap[label] || 0) + e.amount;
  });

  // Convert to array
  const chartData = Object.entries(dateMap).map(([date, amount]) => ({
    date,
    Amount: amount
  })).sort((a, b) => {
    const [aDay, aMonth] = a.date.split("/").map(Number);
    const [bDay, bMonth] = b.date.split("/").map(Number);
    if (aMonth !== bMonth) return aMonth - bMonth;
    return aDay - bDay;
  });

  const getCategoryEmoji = (catName: string): string => {
    const lower = catName.toLowerCase();
    if (lower.includes("plastic") || lower.includes("plastik")) return "🛍️";
    if (lower.includes("sabun") || lower.includes("detergen") || lower.includes("pewangi")) return "🧴";
    if (lower.includes("listrik") || lower.includes("air") || lower.includes("pdam") || lower.includes("pln")) return "⚡";
    if (lower.includes("sewa") || lower.includes("kontrak") || lower.includes("ruko")) return "🏠";
    if (lower.includes("gaji") || lower.includes("karyawan") || lower.includes("helper") || lower.includes("upah")) return "👥";
    if (lower.includes("mesin") || lower.includes("servis") || lower.includes("service") || lower.includes("perbaikan")) return "🔧";
    if (lower.includes("pemasaran") || lower.includes("iklan") || lower.includes("brosur")) return "📢";
    return "🪙";
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#0A0A0B] text-[#F4F4F5] animate-fade-in font-sans">
      
      {/* 0. Filter Periode & Ekspor Bulanan */}
      <div className="bg-[#121214] border border-[#27272A] p-4 rounded-none space-y-3 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-[10px] text-zinc-400 font-black uppercase tracking-wider">
              PERIODE OPERASIONAL LAUNDRY
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="text-xs bg-zinc-950 border border-zinc-800 rounded-none p-1.5 px-3 font-black text-white focus:outline-none focus:border-emerald-500 cursor-pointer shadow-xs min-w-[140px]"
            >
              <option value="Semua">Semua Periode</option>
              {monthList.map(m => (
                <option key={m} value={m}>{formatMonthLabel(m)}</option>
              ))}
              <option value="custom">Pilih Periode Sendiri</option>
            </select>
            
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-150 transition-all shadow-sm active:scale-95"
              title="Ekspor pengeluaran pada periode ini dalam format CSV"
            >
              <Download className="w-3.5 h-3.5 stroke-[3px]" />
              Ekspor Laporan
            </button>
          </div>
        </div>

        {selectedPeriod === "custom" && (
          <div className="grid grid-cols-2 gap-2 animate-fade-in bg-zinc-950 border border-zinc-900 p-2.5 text-xs">
            <div>
              <label className="block text-[8px] text-zinc-500 font-black uppercase mb-1">Mulai Tanggal:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs bg-zinc-900 border border-zinc-800 text-zinc-350 p-1.5 font-semibold focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-[8px] text-zinc-500 font-black uppercase mb-1">Sampai Tanggal:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs bg-zinc-900 border border-zinc-800 text-zinc-350 p-1.5 font-semibold focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 1. Header Ringkasan Keuangan Card */}
      <div className="bg-[#121214] rounded-none border border-[#27272A] p-5 shadow-sm relative">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
        <div className="flex justify-between items-center mb-1">
          <span className="text-[9px] uppercase font-black text-zinc-500 tracking-wider">
            TOTAL PENGELUARAN OPERASIONAL
          </span>
          <span className="text-[9px] bg-emerald-950/40 border border-emerald-800/80 px-2.5 py-0.5 rounded-none text-emerald-400 font-extrabold font-mono uppercase">
            {selectedPeriod === "Semua" ? "SEMUA PERIODE" : selectedPeriod === "custom" ? "KUSTOM RANGE" : formatMonthLabel(selectedPeriod).toUpperCase()}
          </span>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="text-3xl font-black text-white font-sans tracking-tighter leading-none mt-1">
            Rp {totalExpense.toLocaleString("id-ID")}
          </span>
          <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-1">
            Menyajikan akumulasi dari <span className="text-emerald-400 font-black">{filteredExpenses.length} transaksi</span> aktif
          </div>
        </div>
      </div>

      {/* 4. Chart Trend Area using Recharts */}
      <div className="bg-[#121214] border border-[#27272A] rounded-none p-4 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3">
          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> GRAFIK TREN PENGELUARAN (RP)
          </h4>
          
          {/* Timeframe pil selector */}
          <div className="flex gap-1 border border-zinc-800 p-0.5 bg-zinc-950">
            {[
              { id: "Semua", label: "SEMUA" },
              { id: "30Hari", label: "30 HARI" },
              { id: "7Hari", label: "7 HARI" }
            ].map((pVal) => (
              <button
                key={pVal.id}
                onClick={() => setTimeframe(pVal.id as any)}
                className={`px-2 py-1 text-[8px] font-black uppercase tracking-wide cursor-pointer ${
                  timeframe === pVal.id
                    ? "bg-emerald-500 text-black"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
              >
                {pVal.label}
              </button>
            ))}
          </div>
        </div>
        
        {chartData.length === 0 ? (
          <div className="h-36 flex items-center justify-center text-zinc-650 text-[10px] font-black text-center uppercase tracking-wide border border-dashed border-zinc-800 p-4">
            Belum ada data biaya untuk filter rentang waktu ini.
          </div>
        ) : (
          <div className="h-36 w-full font-mono text-[9px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272A" />
                <XAxis dataKey="date" stroke="#71717A" />
                <YAxis stroke="#71717A" />
                <Tooltip 
                  formatter={(value: any) => [`Rp ${Number(value).toLocaleString("id-ID")}`, 'Biaya']}
                  contentStyle={{ backgroundColor: "#18181B", borderRadius: "0px", border: "1px solid #27272A", color: "#fff", fontSize: "10px" }}
                />
                <Area type="monotone" dataKey="Amount" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 5. Cost Breakdown list - Bento styles */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest pl-1">
          📊 DISTRIBUSI OPERASIONAL
        </h4>
        <div className="grid grid-cols-1 gap-2">
          {Object.keys(categories).length === 0 ? (
            <div className="bg-[#121214] border border-[#27272A] p-6 text-center rounded-none">
              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                Belum Ada Kategori Terdaftar
              </span>
              <p className="text-[10.5px] text-zinc-550 font-bold leading-relaxed max-w-xs mx-auto text-balance">
                Tambahkan kategori kustom di tab catat.
              </p>
            </div>
          ) : (
            Object.entries(categories)
              .sort((a, b) => {
                const sumA = categorySums[a[0]] || 0;
                const sumB = categorySums[b[0]] || 0;
                if (sumB !== sumA) return sumB - sumA;
                return a[0].localeCompare(b[0]);
              })
              .map(([catName, spec]) => {
                const sum = categorySums[catName] || 0;
                const percent = totalExpense > 0 ? Math.round((sum / totalExpense) * 100) : 0;
                const isExpanded = expandedCategory === catName;
                const matchingExpenses = filteredExpenses
                  .filter(e => e.category === catName)
                  .sort((a, b) => b.date.localeCompare(a.date));
                
                return (
                  <div 
                    key={catName}
                    className={`bg-[#121214] border rounded-none p-3 transition-all duration-150 select-none ${
                      isExpanded 
                        ? "border-[#10B981] bg-[#161619]" 
                        : "border-[#27272A] hover:border-zinc-700 cursor-pointer active:scale-[0.995]"
                    }`}
                    onClick={() => setExpandedCategory(isExpanded ? null : catName)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-2 bg-zinc-950 border border-zinc-800 rounded-none text-sm shrink-0">
                          {getCategoryEmoji(catName)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h5 className="text-[11px] font-black text-white tracking-tight leading-3 truncate">{catName.toUpperCase()}</h5>
                            <span className="text-[8px] bg-zinc-950 border border-zinc-900 font-mono text-zinc-500 font-bold px-1.5 py-0.2 rounded-none shrink-0">
                              {matchingExpenses.length}x
                            </span>
                            {catName === highestCategoryName && sum > 0 && (
                              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono text-[7.5px] font-bold px-1.5 py-0.2 rounded-none uppercase tracking-wide">
                                🔥 TERBESAR
                              </span>
                            )}
                          </div>
                          <div className="w-24 h-1.5 bg-zinc-950 border border-zinc-950/40 rounded-none mt-1.5 overflow-hidden">
                            <div 
                              style={{ width: `${percent}%` }}
                              className="h-full bg-emerald-500 rounded-none animate-all duration-300"
                            />
                          </div>
                        </div>
                      </div>
 
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-black text-white font-mono">
                            Rp {sum.toLocaleString("id-ID")}
                          </div>
                          <div className="text-[9px] text-[#A1A1AA] font-bold uppercase tracking-widest mt-0.5">
                            {percent}% PROPORSI
                          </div>
                        </div>
                        <span className={`text-xs text-zinc-550 transition-transform duration-200 font-black shrink-0 ${isExpanded ? "rotate-90 text-emerald-400" : ""}`}>
                          &rarr;
                        </span>
                      </div>
                    </div>

                    {/* Expandable Transaction History List */}
                    {isExpanded && (
                      <div 
                        className="mt-3.5 border-t border-zinc-800/80 pt-3.5 space-y-2.5 animate-fade-in text-left cursor-default"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Sub Category Summary Breakdown */}
                        {(() => {
                          const subCategoryBreakdown: Record<string, number> = {};
                          let noSubCategorySum = 0;

                          matchingExpenses.forEach((exp) => {
                            if (exp.subCategory) {
                              subCategoryBreakdown[exp.subCategory] = (subCategoryBreakdown[exp.subCategory] || 0) + exp.amount;
                            } else {
                              noSubCategorySum += exp.amount;
                            }
                          });

                          const allSubKeys = Object.keys(subCategoryBreakdown);

                          if (allSubKeys.length > 0 || noSubCategorySum > 0) {
                            return (
                              <div className="mb-3.5 bg-zinc-950 border border-zinc-900 p-2.5 space-y-2">
                                <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                                  <span className="text-[9px] font-black tracking-widest text-[#10B981] uppercase">
                                    📂 DETAIL SUB KATEGORI ({catName.toUpperCase()})
                                  </span>
                                  <span className="text-[8px] text-zinc-550 font-mono font-bold uppercase">
                                    Total Kategori Utama: Rp {sum.toLocaleString("id-ID")}
                                  </span>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                                  {allSubKeys.map((subName) => {
                                    const subSum = subCategoryBreakdown[subName] || 0;
                                    const subPercent = sum > 0 ? Math.round((subSum / sum) * 100) : 0;
                                    return (
                                      <div key={subName} className="bg-zinc-900/40 border border-zinc-900/60 p-2 space-y-1">
                                        <div className="flex justify-between items-center font-bold">
                                          <span className="text-zinc-300 truncate max-w-[140px]" title={subName}>
                                            📦 {subName}
                                          </span>
                                          <span className="font-mono text-zinc-400">
                                            Rp {subSum.toLocaleString("id-ID")} ({subPercent}%)
                                          </span>
                                        </div>
                                        <div className="w-full h-1 bg-zinc-950 rounded-none overflow-hidden">
                                          <div 
                                            style={{ width: `${subPercent}%` }}
                                            className="h-full bg-amber-500 rounded-none transition-all duration-300"
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {noSubCategorySum > 0 && (
                                    <div className="bg-zinc-900/40 border border-zinc-900/60 p-2 space-y-1">
                                      <div className="flex justify-between items-center font-bold">
                                        <span className="text-zinc-550 truncate">
                                          ⚪ Tanpa Sub-Kategori / Lainnya
                                        </span>
                                        <span className="font-mono text-zinc-400">
                                          Rp {noSubCategorySum.toLocaleString("id-ID")} ({sum > 0 ? Math.round((noSubCategorySum / sum) * 100) : 0}%)
                                        </span>
                                      </div>
                                      <div className="w-full h-1 bg-zinc-950 rounded-none overflow-hidden">
                                        <div 
                                          style={{ width: `${sum > 0 ? Math.round((noSubCategorySum / sum) * 100) : 0}%` }}
                                          className="h-full bg-zinc-650 rounded-none transition-all duration-300"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        <div className="text-[8.5px] font-black tracking-widest text-[#10B981] uppercase mb-1.5 flex items-center justify-between">
                          <span>RIWAYAT TRANSAKSI ({matchingExpenses.length} CATATAN)</span>
                          <span className="text-zinc-650 font-bold tracking-tight lowercase">klik logo kategori untuk menutup</span>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono">
                          {matchingExpenses.length === 0 ? (
                            <p className="text-[9px] text-zinc-650 italic font-sans font-medium">Tidak ada transaksi terdaftar.</p>
                          ) : (
                            matchingExpenses.map((exp) => (
                              <div key={exp.id} className="bg-zinc-950 border border-zinc-900/60 p-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-extrabold text-[11px] text-zinc-200 font-sans">{exp.title}</span>
                                    {exp.subCategory && (
                                      <span className="text-[7.5px] bg-amber-950/40 border border-amber-900 text-amber-500 font-black px-1.5 py-0.5 rounded-none shrink-0 tracking-wider font-mono">
                                        📂 {exp.subCategory.toUpperCase()}
                                      </span>
                                    )}
                                    <span className="text-[7.5px] bg-zinc-900 border border-zinc-850 text-zinc-500 font-black px-1.5 py-0.5 rounded-none shrink-0 tracking-wider font-mono">
                                      {exp.paymentMethod.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[9px] text-zinc-500 mt-0.5 font-mono">
                                    <span>{exp.date}</span>
                                    {exp.notes && (
                                      <span className="text-zinc-400 italic font-sans max-w-[150px] truncate" title={exp.notes}>
                                        ({exp.notes})
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[11px] font-black text-rose-500">
                                    - Rp {exp.amount.toLocaleString("id-ID")}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* 5.5. Recent Transactions Feed (Aktivitas Terbaru Sesuai Filter) */}
      <div className="bg-[#121214] border border-[#27272A] p-4 rounded-none space-y-3 shadow-xs font-sans">
        <div className="flex justify-between items-center">
          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
            ⏱️ DAFTAR CATATAN TRANSAKSI PERIODE INI
          </h4>
          <span className="text-[9px] text-[#10B981] font-mono font-black border border-emerald-950/40 bg-emerald-950/20 px-2 py-0.5">
            {filteredExpenses.length} TRX
          </span>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {filteredExpenses.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-zinc-850">
              <span className="text-[10px] text-zinc-650 font-black uppercase tracking-wide block">BELUM ADA TRANSAKSI DI PERIODE INI</span>
              <button 
                onClick={() => onSetViewTab("catat")}
                className="text-[9px] text-emerald-500 underline font-bold mt-1"
              >
                Mulai Catat Sekarang
              </button>
            </div>
          ) : (
            filteredExpenses
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((exp) => {
                return (
                  <div key={exp.id} className="bg-zinc-950 border border-zinc-900/60 p-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span className="p-1 px-2 bg-zinc-900 border border-zinc-800 text-xs shrink-0 rounded-none">
                        {getCategoryEmoji(exp.category)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap font-sans">
                          <span className="font-extrabold text-[#F4F4F5] truncate max-w-[150px]">{exp.title}</span>
                          {exp.subCategory && (
                            <span className="text-[7.5px] text-amber-500 font-bold bg-amber-950/20 px-1 py-0.2 shrink-0 rounded-none border border-amber-900/60 font-mono uppercase">
                              📂 {exp.subCategory}
                            </span>
                          )}
                          <span className="text-[7.5px] text-zinc-500 font-bold bg-zinc-900 px-1 py-0.2 shrink-0 rounded-none border border-zinc-850 font-mono uppercase">
                            {exp.paymentMethod}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[8.5px] text-zinc-550 font-mono">
                          <span>{exp.date}</span>
                          {exp.notes && (
                            <span className="text-zinc-400 italic font-sans max-w-[200px] truncate" title={exp.notes}>
                              ({exp.notes})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-xs font-black text-[#F4F4F5]">
                        Rp {exp.amount.toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* 6. Quick Action Jump Card */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-none p-5 text-black relative overflow-hidden flex items-center justify-between border-l-4 border-white">
        <div className="space-y-1 relative z-10">
          <span className="bg-white/30 text-black text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-none border border-black/10">
            SIRI REKOMENDASI AI
          </span>
          <h4 className="text-sm font-black tracking-tight leading-tight uppercase">OPTIMASI CASHFLOW ANDA</h4>
          <p className="text-[9.5px] font-bold text-black/80 leading-snug max-w-[210px] mt-1">
            Sari AI siap membantu Anda menganalisa takaran detergen dan konsumsi listrik harian.
          </p>
        </div>
        <button
          onClick={() => onSetViewTab("advisor")}
          className="p-3 bg-black text-emerald-400 font-extrabold rounded-none hover:bg-neutral-900 transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95 shadow-lg border border-emerald-500"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
}
