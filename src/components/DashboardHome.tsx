import React, { useState, useMemo } from "react";
import { TrendingUp, ArrowRight, Calendar, Download, Sparkles, X } from "lucide-react";
import { Expense, CategorySpec } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";

interface DashboardHomeProps {
  expenses: Expense[];
  budgetLimit: number;
  categories: Record<string, CategorySpec>;
  onSetViewTab: (tab: string, date?: string) => void;
  onSetBudgetLimit: (limit: number) => void;
  onResetToEmpty: () => void;
  onLoadSampleData: () => void;
}

const renderCustomizedLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (!value || value <= 0) return null;
  
  let formatted = "";
  if (value >= 1000000) {
    const jtVal = value / 1000000;
    formatted = jtVal % 1 === 0 ? jtVal.toFixed(0) : jtVal.toFixed(1).replace(".", ",");
    formatted += "jt";
  } else if (value >= 1000) {
    const rbVal = value / 1000;
    formatted = rbVal % 1 === 0 ? rbVal.toFixed(0) : rbVal.toFixed(1).replace(".", ",");
    formatted += "rb";
  } else {
    formatted = value.toString();
  }

  return (
    <text
      x={x + width / 2}
      y={y - 6}
      fill="#000000"
      fontSize={11}
      fontWeight="900"
      fontFamily="sans-serif"
      textAnchor="middle"
    >
      {formatted}
    </text>
  );
};

const formatToIndonesianDate = (dateStr: string) => {
  if (!dateStr || !dateStr.includes("-")) return dateStr;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const monthNames = [
    "januari", "februari", "maret", "april", "mei", "juni", 
    "juli", "agustus", "september", "oktober", "november", "desember"
  ];
  const mIndex = parseInt(month, 10) - 1;
  const monthName = monthNames[mIndex] || month;
  return `${day}-${monthName}-${year}`;
};

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
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    return new Date().toISOString().substring(0, 7);
  });
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  // Custom interactive dual-month calendar states
  const [calendarBase, setCalendarBase] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() }; // month is 0-indexed
  });
  const [tempStartDate, setTempStartDate] = useState("");
  const [tempEndDate, setTempEndDate] = useState("");
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const [showCalendar, setShowCalendar] = useState(true);

  // Focus date state (when bar on daily chart is clicked)
  const [clickedDailyDate, setClickedDailyDate] = useState<string>("");

  React.useEffect(() => {
    setClickedDailyDate("");
  }, [selectedPeriod, startDate, endDate]);

  // Helper to format dates in Indonesian style
  const formatIndoDate = (dateStr: string) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return dateStr;
    }
  };

  // Sync temp dates when entering custom mode
  React.useEffect(() => {
    if (selectedPeriod === "custom") {
      setTempStartDate(startDate);
      setTempEndDate(endDate);
      setShowCalendar(true);
    }
  }, [selectedPeriod]);

  const MONTH_NAMES_INDO = [
    "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
    "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
  ];

  const formatYMD = (year: number, monthZeroBased: number, day: number) => {
    const m = String(monthZeroBased + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  };

  const handleDateClick = (ymd: string) => {
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      setTempStartDate(ymd);
      setTempEndDate("");
    } else {
      if (ymd < tempStartDate) {
        setTempStartDate(ymd);
        setTempEndDate("");
      } else {
        setTempEndDate(ymd);
      }
    }
  };

  const handleDateMouseEnter = (ymd: string) => {
    if (tempStartDate && !tempEndDate) {
      setHoveredDate(ymd);
    }
  };

  const handleDateMouseLeave = () => {
    setHoveredDate(null);
  };

  const handlePrevMonth = () => {
    setCalendarBase(prev => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setCalendarBase(prev => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  const handleApplyCustomPeriod = () => {
    if (tempStartDate && tempEndDate) {
      if (tempStartDate > tempEndDate) {
        setStartDate(tempEndDate);
        setEndDate(tempStartDate);
      } else {
        setStartDate(tempStartDate);
        setEndDate(tempEndDate);
      }
      setShowCalendar(false);
    } else if (tempStartDate) {
      setStartDate(tempStartDate);
      setEndDate(tempStartDate);
      setShowCalendar(false);
    }
  };

  const handleResetCustomPeriod = () => {
    setTempStartDate("");
    setTempEndDate("");
    setStartDate("");
    setEndDate("");
    setHoveredDate(null);
    setShowCalendar(true);
  };

  const [timeframe, setTimeframe] = useState<"Semua" | "7Hari" | "30Hari">("Semua");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  const getEmployeeNameFromExpense = (title: string, notes?: string): string | null => {
    if (title.includes("Gaji Mingguan Staf:")) {
      const parts = title.split("Gaji Mingguan Staf:");
      if (parts.length > 1) {
        return parts[1].split("(")[0].trim();
      }
    }
    const titleMatch = title.match(/Gaji (?:Mingguan )?(?:Staf|Karyawan|Staf:|Helper)?\s*:\s*([A-Za-z0-9\s]+)/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].split("(")[0].split("-")[0].trim();
    }
    
    const notesMatch = notes?.match(/Gaji (?:Mingguan )?(?:Staf|Karyawan|Staf:|Helper)?\s*([A-Za-z0-9\s]+)/i);
    if (notesMatch && notesMatch[1]) {
      return notesMatch[1].trim();
    }
    
    if (title.toLowerCase().startsWith("gaji ")) {
      return title.substring(5).split("(")[0].split("-")[0].trim();
    }
    
    return null;
  };

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
  const monthList = useMemo(() => {
    return Array.from(
      new Set([
        currentMonthStr,
        ...expenses.map(e => e.date.substring(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m))
      ])
    ).sort().reverse();
  }, [expenses, currentMonthStr]);

  // Filter expenses list first according to month selection or custom dates - Memoized
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
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
  }, [expenses, selectedPeriod, startDate, endDate]);

  // Calculate stats on filtered subset - Memoized
  const focusedExpenses = useMemo(() => {
    if (!clickedDailyDate) return filteredExpenses;
    return filteredExpenses.filter(e => e.date === clickedDailyDate);
  }, [filteredExpenses, clickedDailyDate]);

  const { totalExpense, largestExpense, categorySums, highestCategoryName } = useMemo(() => {
    const total = focusedExpenses.reduce((sum, e) => sum + e.amount, 0);

    const largest = focusedExpenses.length > 0 
      ? focusedExpenses.reduce((max, exp) => exp.amount > max.amount ? exp : max, focusedExpenses[0])
      : null;

    const sums: Record<string, number> = {};
    focusedExpenses.forEach(e => {
      sums[e.category] = (sums[e.category] || 0) + e.amount;
    });

    const highest = Object.entries(sums).reduce((maxCat, [catName, amount]) => {
      const maxAmount = sums[maxCat] || 0;
      return amount > maxAmount ? catName : maxCat;
    }, "");

    return {
      totalExpense: total,
      largestExpense: largest,
      categorySums: sums,
      highestCategoryName: highest
    };
  }, [focusedExpenses]);

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

  // Generate data for 2026 monthly expenses
  const chartData = useMemo(() => {
    const monthsIndo = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    
    // Initialize with all 12 months of 2026
    const monthlyData = monthsIndo.map((month, index) => ({
      date: month,
      Amount: 0,
      monthIndex: index
    }));

    // Sum up expenses for each month in the year 2026
    expenses.forEach(e => {
      if (e.date && e.date.startsWith("2026-")) {
        const monthPart = parseInt(e.date.substring(5, 7), 10);
        if (monthPart >= 1 && monthPart <= 12) {
          monthlyData[monthPart - 1].Amount += e.amount;
        }
      }
    });

    return monthlyData;
  }, [expenses]);

  // Generate daily expense chart data corresponding to the selected period
  const dashboardDailyChartData = useMemo(() => {
    if (filteredExpenses.length === 0) return [];

    // Check if selectedPeriod is a specific month (YYYY-MM)
    const isYearMonth = /^\d{4}-\d{2}$/.test(selectedPeriod);
    if (isYearMonth) {
      const [yearStr, monthStr] = selectedPeriod.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10); // month part (1-12)
      const numDays = new Date(year, month, 0).getDate();
      
      const data = [];
      for (let d = 1; d <= numDays; d++) {
        const dayStr = String(d).padStart(2, "0");
        const fullDate = `${selectedPeriod}-${dayStr}`;
        
        const daySum = filteredExpenses
          .filter(e => e.date === fullDate)
          .reduce((sum, e) => sum + e.amount, 0);
          
        data.push({
          dateLabel: String(d),
          fullDate,
          Amount: daySum
        });
      }
      return data;
    } else {
      // If "Semua" or "custom"
      // Group by date and sort chronologically
      const dateMap: Record<string, number> = {};
      filteredExpenses.forEach(e => {
        if (e.date) {
          dateMap[e.date] = (dateMap[e.date] || 0) + e.amount;
        }
      });
      
      const sortedDates = Object.keys(dateMap).sort();
      // limit to last 30 dates for readability
      const datesToShow = sortedDates.slice(-30);
      return datesToShow.map(d => {
        let label = d;
        const parts = d.split("-");
        if (parts.length === 3) {
          label = `${parts[2]}/${parts[1]}`;
        }
        return {
          dateLabel: label,
          fullDate: d,
          Amount: dateMap[d]
        };
      });
    }
  }, [filteredExpenses, selectedPeriod]);

  const dashboardDailyChartTitle = useMemo(() => {
    if (selectedPeriod === "Semua") {
      return "GRAFIK PENGELUARAN HARIAN (30 HARI TERAKHIR)";
    }
    if (selectedPeriod === "custom") {
      return "GRAFIK PENGELUARAN HARIAN (PERIODE KUSTOM)";
    }
    return `GRAFIK PENGELUARAN HARIAN - ${formatMonthLabel(selectedPeriod).toUpperCase()}`;
  }, [selectedPeriod]);

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

        {selectedPeriod === "custom" && showCalendar && (
          <div className="animate-fade-in bg-zinc-950 border border-[#27272A] p-4 text-xs space-y-4">
            
            {/* Top Inputs & Controls */}
            <div className="flex flex-col gap-3 md:flex-row md:items-end justify-between items-stretch">
              <div className="flex flex-1 items-center gap-2">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-[8px] text-zinc-500 font-black uppercase mb-1">Mulai Tanggal:</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-[10px] text-zinc-550">📅</span>
                    <input
                      type="date"
                      value={tempStartDate}
                      onChange={(e) => setTempStartDate(e.target.value)}
                      className="w-full text-xs bg-zinc-900 border border-zinc-800 text-zinc-200 py-1.5 pl-7 pr-1.5 font-bold focus:outline-none focus:border-emerald-500 font-mono rounded-none"
                    />
                  </div>
                </div>

                <span className="text-zinc-550 font-bold self-end mb-2">&mdash;</span>

                <div className="flex-1 min-w-[120px]">
                  <label className="block text-[8px] text-zinc-500 font-black uppercase mb-1">Sampai Tanggal:</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-[10px] text-zinc-550">📅</span>
                    <input
                      type="date"
                      value={tempEndDate}
                      onChange={(e) => setTempEndDate(e.target.value)}
                      className="w-full text-xs bg-zinc-900 border border-zinc-800 text-zinc-200 py-1.5 pl-7 pr-1.5 font-bold focus:outline-none focus:border-emerald-500 font-mono rounded-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleApplyCustomPeriod}
                  className="px-5 py-2 bg-[#00c070]/95 hover:bg-[#00c070] text-black text-[10.5px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-150 transition-all shadow-sm flex-1 md:flex-none text-center active:scale-95"
                >
                  APPLY
                </button>
                <button
                  type="button"
                  onClick={handleResetCustomPeriod}
                  className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-750 text-zinc-450 hover:text-zinc-200 text-[10.5px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-150 transition-all flex-1 md:flex-none text-center active:scale-95"
                >
                  RESET
                </button>
              </div>
            </div>

            {/* Calendar Stage Container */}
            <div className="border-t border-zinc-900 pt-4">
              <div className="flex items-center justify-between mb-4 px-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-855 text-[#F4F4F5] hover:text-emerald-500 transition-all text-xs font-black rounded-none cursor-pointer select-none font-mono"
                >
                  &larr; PREV
                </button>
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.25em] font-mono">
                  NAVIGASI BULANAN
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-855 text-[#F4F4F5] hover:text-emerald-500 transition-all text-xs font-black rounded-none cursor-pointer select-none font-mono"
                >
                  NEXT &rarr;
                </button>
              </div>

              {/* The Two Months Side by Side */}
              <div className="flex flex-col md:flex-row gap-6 md:gap-8 justify-between">
                {/* Month 1 (Left) */}
                {(() => {
                  const year = calendarBase.year;
                  const monthIndex = calendarBase.month;
                  
                  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
                  const firstDayIndex = new Date(year, monthIndex, 1).getDay(); // 0 = Sun, 1 = Mon...
                  
                  const blanks = Array(firstDayIndex).fill(null);
                  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
                  const slots = [...blanks, ...days];
                  const monthName = MONTH_NAMES_INDO[monthIndex];

                  return (
                    <div className="flex-1 min-w-[240px] font-sans">
                      <h5 className="text-[11px] font-black uppercase tracking-widest text-[#F4F4F5] text-center mb-4 font-sans pb-1.5 border-b border-zinc-900 flex items-center justify-center gap-1.5">
                        <span className="text-emerald-500 text-xs font-serif font-black">&lsaquo;</span>
                        {monthName} {year}
                      </h5>
                      
                      {/* Week headers */}
                      <div className="grid grid-cols-7 gap-y-1 text-center font-black text-zinc-500 text-[8.5px] uppercase tracking-widest mb-3 font-mono">
                        <span>SU</span>
                        <span>MO</span>
                        <span>TU</span>
                        <span>WE</span>
                        <span>TH</span>
                        <span>FR</span>
                        <span>SA</span>
                      </div>

                      {/* Day list */}
                      <div className="grid grid-cols-7 gap-y-1.5 text-center text-xs relative">
                        {slots.map((day, idx) => {
                          if (day === null) {
                            return <div key={`blank1-${idx}`} className="w-8 h-8" />;
                          }

                          const ymd = formatYMD(year, monthIndex, day);
                          const isStart = ymd === tempStartDate;
                          const isEnd = ymd === tempEndDate;
                          
                          let isInRange = false;
                          if (tempStartDate && tempEndDate) {
                            const startVal = tempStartDate;
                            const endVal = tempEndDate;
                            if (startVal <= endVal) {
                              isInRange = ymd > startVal && ymd < endVal;
                            } else {
                              isInRange = ymd > endVal && ymd < startVal;
                            }
                          } else if (tempStartDate && hoveredDate) {
                            const startVal = tempStartDate;
                            const endVal = hoveredDate;
                            if (startVal <= endVal) {
                              isInRange = ymd > startVal && ymd < endVal;
                            } else {
                              isInRange = ymd > endVal && ymd < startVal;
                            }
                          }

                          let dayBtnClass = "w-8 h-8 mx-auto flex items-center justify-center text-[10.5px] font-bold duration-100 relative cursor-pointer ";
                          
                          if (isStart || isEnd) {
                            dayBtnClass += "bg-emerald-500 text-black font-extrabold z-10 ";
                            if (isStart && tempEndDate && tempStartDate < tempEndDate) {
                              dayBtnClass += "rounded-l-full ";
                            } else if (isEnd && tempStartDate && tempStartDate < tempEndDate) {
                              dayBtnClass += "rounded-r-full ";
                            } else {
                              dayBtnClass += "rounded-full ";
                            }
                          } else if (isInRange) {
                            dayBtnClass += "bg-[#00c070]/20 text-[#00c070] font-black ";
                          } else {
                            dayBtnClass += "text-zinc-350 hover:bg-zinc-850 hover:text-white rounded-md ";
                          }

                          return (
                            <button
                              key={`day1-${day}`}
                              type="button"
                              onClick={() => handleDateClick(ymd)}
                              onMouseEnter={() => handleDateMouseEnter(ymd)}
                              onMouseLeave={handleDateMouseLeave}
                              className={dayBtnClass}
                              style={{ outline: "none" }}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Month 2 (Right) */}
                {(() => {
                  const m2Year = calendarBase.month === 11 ? calendarBase.year + 1 : calendarBase.year;
                  const m2MonthIndex = calendarBase.month === 11 ? 0 : calendarBase.month + 1;
                  
                  const daysInMonth2 = new Date(m2Year, m2MonthIndex + 1, 0).getDate();
                  const firstDayIndex2 = new Date(m2Year, m2MonthIndex, 1).getDay(); // 0 = Sun, 1 = Mon...
                  
                  const blanks2 = Array(firstDayIndex2).fill(null);
                  const days2 = Array.from({ length: daysInMonth2 }, (_, i) => i + 1);
                  const slots2 = [...blanks2, ...days2];
                  const monthName2 = MONTH_NAMES_INDO[m2MonthIndex];

                  return (
                    <div className="flex-1 min-w-[240px] font-sans">
                      <h5 className="text-[11px] font-black uppercase tracking-widest text-[#F4F4F5] text-center mb-4 font-sans pb-1.5 border-b border-zinc-900 flex items-center justify-center gap-1.5">
                        {monthName2} {m2Year}
                        <span className="text-emerald-500 text-xs font-serif font-black">&rsaquo;</span>
                      </h5>
                      
                      {/* Week headers */}
                      <div className="grid grid-cols-7 gap-y-1 text-center font-black text-zinc-500 text-[8.5px] uppercase tracking-widest mb-3 font-mono">
                        <span>SU</span>
                        <span>MO</span>
                        <span>TU</span>
                        <span>WE</span>
                        <span>TH</span>
                        <span>FR</span>
                        <span>SA</span>
                      </div>

                      {/* Day list */}
                      <div className="grid grid-cols-7 gap-y-1.5 text-center text-xs relative">
                        {slots2.map((day, idx) => {
                          if (day === null) {
                            return <div key={`blank2-${idx}`} className="w-8 h-8" />;
                          }

                          const ymd = formatYMD(m2Year, m2MonthIndex, day);
                          const isStart = ymd === tempStartDate;
                          const isEnd = ymd === tempEndDate;
                          
                          let isInRange = false;
                          if (tempStartDate && tempEndDate) {
                            const startVal = tempStartDate;
                            const endVal = tempEndDate;
                            if (startVal <= endVal) {
                              isInRange = ymd > startVal && ymd < endVal;
                            } else {
                              isInRange = ymd > endVal && ymd < startVal;
                            }
                          } else if (tempStartDate && hoveredDate) {
                            const startVal = tempStartDate;
                            const endVal = hoveredDate;
                            if (startVal <= endVal) {
                              isInRange = ymd > startVal && ymd < endVal;
                            } else {
                              isInRange = ymd > endVal && ymd < startVal;
                            }
                          }

                          let dayBtnClass = "w-8 h-8 mx-auto flex items-center justify-center text-[10.5px] font-bold duration-100 relative cursor-pointer ";
                          
                          if (isStart || isEnd) {
                            dayBtnClass += "bg-emerald-500 text-black font-extrabold z-10 ";
                            if (isStart && tempEndDate && tempStartDate < tempEndDate) {
                              dayBtnClass += "rounded-l-full ";
                            } else if (isEnd && tempStartDate && tempStartDate < tempEndDate) {
                              dayBtnClass += "rounded-r-full ";
                            } else {
                              dayBtnClass += "rounded-full ";
                            }
                          } else if (isInRange) {
                            dayBtnClass += "bg-[#00c070]/20 text-[#00c070] font-black ";
                          } else {
                            dayBtnClass += "text-zinc-350 hover:bg-zinc-850 hover:text-white rounded-md ";
                          }

                          return (
                            <button
                              key={`day2-${day}`}
                              type="button"
                              onClick={() => handleDateClick(ymd)}
                              onMouseEnter={() => handleDateMouseEnter(ymd)}
                              onMouseLeave={handleDateMouseLeave}
                              className={dayBtnClass}
                              style={{ outline: "none" }}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

            </div>
          </div>
        )}

        {selectedPeriod === "custom" && !showCalendar && (
          <div className="animate-fade-in bg-zinc-950 border border-[#27272A] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500 text-sm">📅</span>
              <span className="text-zinc-400 font-bold uppercase text-[9px] tracking-wider">RENTANG TANGGAL KUSTOM:</span>
              <span className="text-[#00c070] font-black font-mono">
                {startDate ? formatIndoDate(startDate) : "(Belum Dipilih)"} &mdash; {endDate ? formatIndoDate(endDate) : "(Belum Dipilih)"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowCalendar(true)}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[9px] font-black uppercase tracking-wider text-white rounded-none cursor-pointer duration-100"
            >
              UBAH / BUKA KALENDER
            </button>
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
            Menyajikan akumulasi dari <span className="text-emerald-400 font-black">{focusedExpenses.length} transaksi</span> aktif
          </div>
        </div>
      </div>

      {clickedDailyDate && (
        <div className="bg-[#0F172A] border border-emerald-500/30 p-3 flex justify-between items-center text-xs text-emerald-400 font-mono font-bold animate-fade-in">
          <span className="flex items-center gap-1.5 uppercase tracking-wide">
            🎯 MENAMPILKAN TRANSAKSI TANGGAL: {formatToIndonesianDate(clickedDailyDate)}
          </span>
          <button 
            type="button"
            onClick={() => setClickedDailyDate("")}
            className="bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-colors font-sans"
          >
            HAPUS FOKUS
          </button>
        </div>
      )}

      {/* 3.5. Daily Expense Bar Chart for Active Period */}
      <div className="bg-[#121214] border border-[#27272A] rounded-none p-4 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3">
          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> {dashboardDailyChartTitle}
          </h4>
        </div>
        
        {dashboardDailyChartData.length === 0 || !dashboardDailyChartData.some(d => d.Amount > 0) ? (
          <div className="h-56 flex items-center justify-center text-zinc-500 text-[10px] font-bold text-center uppercase tracking-wide border border-dashed border-[#27272A] p-4">
            Belum ada data biaya harian untuk periode ini.
          </div>
        ) : (
          <div className="h-56 w-full font-mono text-[9px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={dashboardDailyChartData} 
                margin={{ top: 22, right: 5, left: -15, bottom: 0 }} 
                barSize={dashboardDailyChartData.length > 20 ? 10 : 20}
                onClick={(state: any) => {
                  if (state && state.activePayload && state.activePayload.length > 0) {
                    const clickedItem = state.activePayload[0].payload;
                    if (clickedItem && clickedItem.fullDate) {
                      onSetViewTab("riwayat", clickedItem.fullDate);
                    }
                  } else if (state && state.activeTooltipIndex !== undefined && dashboardDailyChartData[state.activeTooltipIndex]) {
                    const clickedItem = dashboardDailyChartData[state.activeTooltipIndex];
                    if (clickedItem && clickedItem.fullDate) {
                      onSetViewTab("riwayat", clickedItem.fullDate);
                    }
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272A" />
                <XAxis 
                  dataKey="dateLabel" 
                  stroke="#71717A" 
                />
                <YAxis stroke="#71717A" />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#18181B] border border-[#27272A] p-2 font-mono text-[10px] text-white">
                          <p className="font-bold uppercase text-[9px] tracking-wider text-zinc-400 mb-0.5">Tanggal: {formatToIndonesianDate(data.fullDate)}</p>
                          <p className="font-black text-[#00D18F] font-sans">Total: Rp {Number(data.Amount).toLocaleString("id-ID")}</p>
                          <p className="text-[8px] text-zinc-500 font-bold uppercase mt-1 border-t border-zinc-800/80 pt-1">
                            👉 Klik untuk lihat detail tanggal ini
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="Amount" 
                  fill="#00D18F" 
                  radius={[2, 2, 0, 0]} 
                  onClick={(data: any) => {
                    if (data && data.fullDate) {
                      onSetViewTab("riwayat", data.fullDate);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 4. Chart Trend Area using Recharts */}
      <div className="bg-[#121214] border border-[#27272A] rounded-none p-4 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3">
          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> GRAFIK PENGELUARAN 2026
          </h4>
        </div>
        
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-zinc-650 text-[10px] font-black text-center uppercase tracking-wide border border-dashed border-zinc-800 p-4">
            Belum ada data biaya untuk tahun 2026.
          </div>
        ) : (
          <div className="h-48 w-full font-mono text-[9px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 22, right: 5, left: -15, bottom: 0 }} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272A" />
                <XAxis 
                  dataKey="date" 
                  stroke="#71717A" 
                  tickFormatter={(val) => {
                    const truncMap: Record<string, string> = {
                      "Januari": "Jan",
                      "Februari": "Feb",
                      "Maret": "Mar",
                      "April": "Apr",
                      "Mei": "Mei",
                      "Juni": "Jun",
                      "Juli": "Jul",
                      "Agustus": "Ags",
                      "September": "Sep",
                      "Oktober": "Okt",
                      "November": "Nov",
                      "Desember": "Des"
                    };
                    return truncMap[val] || val;
                  }}
                />
                <YAxis stroke="#71717A" />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#18181B] border border-[#27272A] p-2 font-mono text-[10px] text-white">
                          <p className="font-bold uppercase text-[9px] tracking-wider text-zinc-400 mb-0.5">{data.date} 2026</p>
                          <p className="font-black text-[#00D18F] font-sans">Total: Rp {Number(data.Amount).toLocaleString("id-ID")}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="Amount" fill="#00D18F" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Amount" content={renderCustomizedLabel} />
                </Bar>
              </BarChart>
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
          {Object.keys(categories).length === 0 && focusedExpenses.length === 0 ? (
            <div className="bg-[#121214] border border-[#27272A] p-6 text-center rounded-none">
              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                Belum Ada Kategori Terdaftar
              </span>
              <p className="text-[10.5px] text-zinc-550 font-bold leading-relaxed max-w-xs mx-auto text-balance">
                Tambahkan kategori kustom di tab catat.
              </p>
            </div>
          ) : (
            (() => {
              // Combine registered categories with any active categories in expenses (e.g. Gaji Karyawan)
              const allCategoryNames = Array.from(
                new Set([
                  ...Object.keys(categories),
                  ...focusedExpenses.map((e) => e.category)
                ])
              );

              return allCategoryNames
                .map((catName) => {
                  const spec = categories[catName] || {
                    name: catName,
                    color: catName.toLowerCase().includes("gaji") ? "#10b981" : "#a1a1aa",
                    bgColor: catName.toLowerCase().includes("gaji") 
                      ? "bg-[#062419] text-[#10b981] border-[#10b981]/30" 
                      : "bg-[#18181b] text-[#e4e4e7] border-[#27272a]",
                    icon: catName.toLowerCase().includes("gaji") ? "Users" : "Coins",
                    subCategories: []
                  };
                  return [catName, spec] as [string, CategorySpec];
                })
                .sort((a, b) => {
                  const sumA = categorySums[a[0]] || 0;
                  const sumB = categorySums[b[0]] || 0;
                  if (sumB !== sumA) return sumB - sumA;
                  return a[0].localeCompare(b[0]);
                })
                .map(([catName, spec]) => {
                  const sum = categorySums[catName] || 0;
                  // Skip displaying dynamically added categories if they have 0 sum
                  if (sum === 0 && !categories[catName]) return null;

                  const percent = totalExpense > 0 ? Math.round((sum / totalExpense) * 100) : 0;
                  const isExpanded = expandedCategory === catName;
                  const matchingExpenses = focusedExpenses
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
                              <div 
                                key={exp.id} 
                                onClick={() => setDetailExpense(exp)}
                                className="bg-zinc-950 border border-zinc-900/60 p-2 flex items-center justify-between gap-2 hover:border-[#10B981]/50 cursor-pointer transition-colors"
                              >
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
            })()
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
            {focusedExpenses.length} TRX
          </span>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {focusedExpenses.length === 0 ? (
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
            focusedExpenses
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
                      <span className="font-mono text-xs font-black text-[#F4F4F5] block">
                        Rp {exp.amount.toLocaleString("id-ID")}
                      </span>
                      {exp.qty !== undefined && exp.qty > 0 && (
                        <span className="text-[8.5px] font-extrabold text-amber-500/90 font-mono mt-0.5 tracking-tight block">
                          {exp.qty} Pcs {exp.unitPrice !== undefined && `@ Rp ${exp.unitPrice.toLocaleString("id-ID")}`}
                        </span>
                      )}
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
            DAMDAM REKOMENDASI AI
          </span>
          <h4 className="text-sm font-black tracking-tight leading-tight uppercase">OPTIMASI CASHFLOW ANDA</h4>
          <p className="text-[9.5px] font-bold text-black/80 leading-snug max-w-[210px] mt-1">
            Damdam AI siap membantu Anda menganalisa takaran detergen dan konsumsi listrik harian.
          </p>
        </div>
        <button
          onClick={() => onSetViewTab("advisor")}
          className="p-3 bg-black text-emerald-400 font-extrabold rounded-none hover:bg-neutral-900 transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95 shadow-lg border border-emerald-500"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Detail Bottom Sheet/Modal */}
      {detailExpense && (
        <div 
          className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4 animate-fade-in font-sans"
          onClick={() => setDetailExpense(null)}
        >
          <div 
            className="w-full max-w-[430px] bg-[#121214] border border-[#27272A] rounded-none overflow-hidden shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#27272A] flex items-center justify-between bg-[#0A0A0B]">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-black text-emerald-450 uppercase tracking-widest block font-sans">📝 DETAIL TRANSAKSI BIAYA</span>
              </div>
              <button 
                onClick={() => setDetailExpense(null)} 
                className="p-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-none text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto no-scrollbar">
              {/* Main Header Display */}
              <div className="text-center bg-zinc-950 border border-zinc-900 p-4 space-y-1">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5 font-sans">Jumlah Nominal</span>
                <span className="text-xl font-mono font-black text-rose-500">
                  Rp {detailExpense.amount.toLocaleString("id-ID")}
                </span>
                <h3 className="text-xs font-black text-white mt-2 leading-relaxed font-sans">
                  {detailExpense.title}
                </h3>
              </div>

              {/* Highlight Employee Name block if Gaji Karyawan */}
              {detailExpense.category === "Gaji Karyawan" && (() => {
                const empName = getEmployeeNameFromExpense(detailExpense.title, detailExpense.notes);
                return (
                  <div className="bg-[#062419] border border-[#10b981]/30 p-3 flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#10b981]/15 border border-[#10b981]/20 flex items-center justify-center shrink-0">
                      <span className="text-base text-emerald-450">👥</span>
                    </div>
                    <div>
                      <span className="text-[8.5px] font-black text-emerald-500 uppercase tracking-widest block font-sans">Nama Karyawan / Staf</span>
                      <span className="text-xs font-black text-white block mt-0.5 font-sans">
                        {empName || "Staf Laundry"}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Specification Table */}
              <div className="bg-zinc-950/40 border border-zinc-900 p-3 space-y-2.5 text-xs font-semibold text-zinc-300">
                <div className="flex justify-between items-center border-b border-zinc-900/60 pb-2">
                  <span className="text-zinc-[450] text-[10px] text-zinc-500 font-sans">Kategori</span>
                  <span className="text-zinc-200 uppercase bg-[#18181b] border border-zinc-800 px-2 py-0.5 text-[9px] font-bold font-sans">
                    👥 {detailExpense.category}
                  </span>
                </div>

                {detailExpense.subCategory && (
                  <div className="flex justify-between items-center border-b border-zinc-900/60 pb-2">
                    <span className="text-zinc-[450] text-[10px] text-zinc-500 font-sans">Sub Kategori</span>
                    <span className="text-amber-500 uppercase bg-amber-955/20 border border-amber-900 px-2 py-0.5 text-[9px] font-bold font-sans">
                      📂 {detailExpense.subCategory}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center border-b border-zinc-900/60 pb-2">
                  <span className="text-zinc-[450] text-[10px] text-zinc-500 font-sans">Tanggal Transaksi</span>
                  <span className="text-zinc-200 font-mono text-[10.5px]">
                    📅 {detailExpense.date}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-0.5">
                  <span className="text-zinc-[450] text-[10px] text-zinc-500 font-sans">Metode Pembayaran</span>
                  <span className="text-zinc-200 uppercase bg-[#0c1e30] border border-[#38bdf8]/20 text-[#38bdf8] px-2 py-0.5 text-[9px] font-bold font-sans">
                    💳 {detailExpense.paymentMethod}
                  </span>
                </div>
              </div>

              {/* Notes / Description Details breakdown */}
              <div>
                <h5 className="text-[9.5px] font-black text-zinc-500 uppercase tracking-wider mb-1.5 font-sans">Rincian & Catatan Biaya</h5>
                <div className="bg-zinc-950 border border-zinc-900 p-3 rounded-none text-[10.5px] text-zinc-300 leading-relaxed font-sans whitespace-pre-line text-left">
                  {detailExpense.notes ? (
                    detailExpense.notes.split(/(?<=\.|\:)\s+/).map((sentence, idx) => {
                      const trimSen = sentence.trim();
                      if (!trimSen) return null;
                      return (
                        <div key={idx} className="flex items-start gap-1.5 mt-1 border-b border-zinc-900/40 pb-1.5 last:border-b-0 last:pb-0 font-sans">
                          <span className="text-emerald-500 select-none">•</span>
                          <span className="font-sans text-zinc-300">{trimSen}</span>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-zinc-550 italic font-medium font-sans">Tidak ada rincian catatan tambahan.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[#27272A] bg-[#0A0A0B] text-right">
              <button 
                onClick={() => setDetailExpense(null)}
                className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-none transition-all cursor-pointer font-sans"
              >
                TUTUP DETAIL
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
