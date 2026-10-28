import React, { useState, useEffect, useMemo } from "react";
import { Search, Filter, Trash2, Edit3, X, Check, Calendar, CreditCard, Tag, Sparkles, AlertCircle, TrendingUp } from "lucide-react";
import { Expense, CategorySpec } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";

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
      fontSize={9}
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

interface ExpenseHistoryProps {
  expenses: Expense[];
  categories: Record<string, CategorySpec>;
  onDeleteExpense: (id: string) => void;
  onUpdateExpense: (expense: Expense) => void;
  triggerConfirm?: (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    isDangerous?: boolean,
    confirmText?: string,
    cancelText?: string
  ) => void;
  onAddCategory?: (name: string, color: string, icon?: string) => void;
  onUpdateCategory?: (oldName: string, newName: string, newColor: string) => void;
  onDeleteCategory?: (catName: string) => void;
  onResetCategoriesToDefault?: () => void;
  onUpdateSubCategories?: (
    catName: string,
    subCats: string[],
    renameMapping?: { oldName: string; newName: string }
  ) => void;
  initialSearchTerm?: string;
  initialSelectedDate?: string;
  onClearSelectedDate?: () => void;
  highlightExpenseId?: string;
}

export function ExpenseHistory({ 
  expenses, 
  categories, 
  onDeleteExpense, 
  onUpdateExpense, 
  triggerConfirm,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onResetCategoriesToDefault,
  onUpdateSubCategories,
  initialSearchTerm = "",
  initialSelectedDate = "",
  onClearSelectedDate,
  highlightExpenseId = ""
 }: ExpenseHistoryProps) {
  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Semua");
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>("Semua");
  const [selectedPayment, setSelectedPayment] = useState<string>("Semua");
  const [selectedMonth, setSelectedMonth] = useState<string>("Semua");
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Sync initialSearchTerm to local searchTerm when it changes
  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  // Sync initialSelectedDate to local selectedDate when it changes and clear conflicting filters
  useEffect(() => {
    if (initialSelectedDate) {
      setSelectedDate(initialSelectedDate);
      setSelectedMonth("Semua");
      setSelectedCategory("Semua");
      setSelectedSubCategory("Semua");
      setSelectedPayment("Semua");
      setSearchTerm("");
    }
  }, [initialSelectedDate]);

  // Category Management states
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#10b981");

  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editNewName, setEditNewName] = useState("");
  const [editNewColor, setEditNewColor] = useState("");

  const [managingSubCatName, setManagingSubCatName] = useState<string | null>(null);
  const [newSubCatName, setNewSubCatName] = useState("");
  const [editingSub, setEditingSub] = useState<{ catName: string; oldName: string; currentInput: string } | null>(null);

  // Extract unique months from expenses in YYYY-MM format
  const uniqueMonths = useMemo(() => {
    const months = new Set<string>();
    expenses.forEach((e) => {
      if (e.date && e.date.length >= 7) {
        months.add(e.date.substring(0, 7));
      }
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  const getIndonesianMonthYear = (yearMonthStr: string) => {
    if (!yearMonthStr || yearMonthStr.length < 7) return yearMonthStr;
    const parts = yearMonthStr.split("-");
    if (parts.length < 2) return yearMonthStr;
    const year = parts[0];
    const month = parts[1];
    const monthNames = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const monthIndex = parseInt(month, 10) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${monthNames[monthIndex]} ${year}`;
    }
    return yearMonthStr;
  };

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

  // Reset selected sub category when category filter changes
  useEffect(() => {
    setSelectedSubCategory("Semua");
  }, [selectedCategory]);
  
  // Detail Modal State
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState<string>("Detergen & Sabun");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPayment, setEditPayment] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editQty, setEditQty] = useState<number>(1);
  const [editUnitPrice, setEditUnitPrice] = useState<string>("");

  // Start inline editing
  const startEdit = (exp: Expense) => {
    setEditingId(exp.id);
    setEditTitle(exp.title);
    setEditAmount(String(exp.amount));
    setEditCategory(exp.category);
    setEditSubCategory(exp.subCategory || "");
    setEditDate(exp.date);
    setEditPayment(exp.paymentMethod);
    setEditNotes(exp.notes || "");
    const qCount = exp.qty !== undefined && exp.qty > 0 ? exp.qty : 1;
    setEditQty(qCount);
    setEditUnitPrice(exp.unitPrice ? String(exp.unitPrice) : String(Math.round(exp.amount / qCount)));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleEditQtyChange = (val: number) => {
    const safeQty = isNaN(val) || val < 1 ? 1 : val;
    setEditQty(safeQty);
    const parsedPrice = parseInt(editUnitPrice.replace(/\D/g, ""), 10) || 0;
    const total = safeQty * parsedPrice;
    setEditAmount(String(total));
  };

  const handleEditUnitPriceChange = (val: string) => {
    const clean = val.replace(/\D/g, "");
    setEditUnitPrice(clean);
    const parsedPrice = parseInt(clean, 10) || 0;
    const total = editQty * parsedPrice;
    setEditAmount(String(total));
  };

  const handleEditAmountChange = (val: string) => {
    const clean = val.replace(/\D/g, "");
    setEditAmount(clean);
    const parsedTotal = parseInt(clean, 10) || 0;
    const computedPrice = editQty > 0 ? Math.round(parsedTotal / editQty) : parsedTotal;
    setEditUnitPrice(String(computedPrice));
  };

  // Auto sync editSubCategory when editCategory changes
  useEffect(() => {
    const parent = categories[editCategory];
    if (parent && parent.subCategories && parent.subCategories.length > 0) {
      if (!parent.subCategories.includes(editSubCategory)) {
        setEditSubCategory(parent.subCategories[0]);
      }
    } else {
      setEditSubCategory("");
    }
  }, [editCategory, categories]);

  const saveEdit = (id: string) => {
    if (!editTitle.trim() || !editAmount.trim() || Number(editAmount) <= 0) {
      alert("Harap lengkapi semua data dengan benar!");
      return;
    }
    onUpdateExpense({
      id,
      title: editTitle.trim(),
      amount: Math.round(Number(editAmount)),
      category: editCategory,
      subCategory: editSubCategory || undefined,
      date: editDate,
      paymentMethod: editPayment,
      notes: editNotes.trim() || undefined,
      qty: editQty,
      unitPrice: Number(editUnitPrice) || Math.round(Number(editAmount) / editQty)
    });
    setEditingId(null);
  };

  // Filtering Logic
  const filteredExpenses = expenses.filter((e) => {
    const matchSearch = e.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (e.notes && e.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchCategory = selectedCategory === "Semua" || e.category === selectedCategory;
    const matchPayment = selectedPayment === "Semua" || e.paymentMethod === selectedPayment;
    
    let matchSubCategory = true;
    if (selectedCategory !== "Semua" && categories[selectedCategory]?.subCategories && categories[selectedCategory].subCategories!.length > 0) {
      if (selectedSubCategory === "Tanpa Sub") {
        matchSubCategory = !e.subCategory;
      } else if (selectedSubCategory !== "Semua") {
        matchSubCategory = e.subCategory === selectedSubCategory;
      }
    }
    
    const matchMonth = selectedMonth === "Semua" || (e.date && e.date.substring(0, 7) === selectedMonth);
    const matchDate = !selectedDate || e.date === selectedDate;
    
    return matchSearch && matchCategory && matchPayment && matchSubCategory && matchMonth && matchDate;
  });

  const totalFilteredAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Memoized daily chart data filtered dynamically by current filter state
  const dailyChartData = useMemo(() => {
    if (filteredExpenses.length === 0) return [];

    // If a specific month is selected
    if (selectedMonth !== "Semua") {
      const [yearStr, monthStr] = selectedMonth.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const numDays = new Date(year, month, 0).getDate();
      
      const data = [];
      for (let d = 1; d <= numDays; d++) {
        const dayStr = String(d).padStart(2, "0");
        const fullDate = `${selectedMonth}-${dayStr}`;
        
        // Sum expenses for this exact day
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
      // If "Semua" is selected, group by date and show the last 30 unique dates with transactions, chronologically.
      const dateMap: Record<string, number> = {};
      filteredExpenses.forEach(e => {
        if (e.date) {
          dateMap[e.date] = (dateMap[e.date] || 0) + e.amount;
        }
      });
      
      const allDates = Object.keys(dateMap).sort();
      // Take the last 30 dates to avoid a cluttered chart
      const last30Dates = allDates.slice(-30);
      
      return last30Dates.map(d => {
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
  }, [filteredExpenses, selectedMonth]);

  const chartTitle = useMemo(() => {
    if (selectedMonth !== "Semua") {
      return `GRAFIK PENGELUARAN HARIAN - ${getIndonesianMonthYear(selectedMonth).toUpperCase()}`;
    }
    return "GRAFIK PENGELUARAN HARIAN (30 HARI TERAKHIR)";
  }, [selectedMonth]);

  // Helper local category emoji
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
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B]">
      
      {/* Filters Area */}
      <div className="bg-[#121214] border-b border-[#27272A] p-4 shrink-0 space-y-3 shadow-xs">
        
        {/* Selected Date Filter Banner */}
        {selectedDate && (
          <div className="bg-emerald-50 border border-emerald-200 p-2.5 flex justify-between items-center text-[11.5px] text-emerald-900 font-sans font-bold animate-fade-in shadow-xs rounded-xs">
            <span className="flex items-center gap-1.5 uppercase tracking-wide">
              🎯 TANGGAL: <span className="font-extrabold text-emerald-950 underline decoration-emerald-400 decoration-2">{formatToIndonesianDate(selectedDate)}</span> (Rp {totalFilteredAmount.toLocaleString("id-ID")})
            </span>
            <button 
              type="button"
              onClick={() => {
                setSelectedDate("");
                onClearSelectedDate?.();
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition-colors font-sans cursor-pointer rounded-xs"
            >
              SEMUA TANGGAL
            </button>
          </div>
        )}

        {/* Keyword Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari pengeluaran atau catatan..."
            className="w-full text-xs bg-zinc-950 border border-zinc-855 rounded-none py-2.5 pl-9 pr-8 font-semibold text-zinc-200 placeholder-zinc-650 focus:outline-none focus:border-emerald-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-3 text-zinc-400 hover:text-white font-bold"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdowns Filter */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {/* Category Filter */}
            <div className="flex flex-col">
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                FILTER KATEGORI:
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs bg-zinc-950 border border-zinc-855 rounded-none p-2 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="Semua">📁 Semua Kategori</option>
                {Object.keys(categories).map((catName) => (
                  <option key={catName} value={catName}>
                    {categories[catName]?.name || catName}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Method Filter */}
            <div className="flex flex-col">
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                METODE BAYAR:
              </label>
              <select
                value={selectedPayment}
                onChange={(e) => setSelectedPayment(e.target.value)}
                className="text-xs bg-zinc-950 border border-zinc-855 rounded-none p-2 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="Semua">💰 Semua Metode</option>
                <option value="Tunai">Tunai</option>
                <option value="Transfer Bank">Transfer Bank</option>
                <option value="E-Wallet">E-Wallet</option>
              </select>
            </div>
          </div>

          {/* Month & Date Filters Row */}
          <div className="grid grid-cols-2 gap-2">
            {/* Month Filter */}
            <div className="flex flex-col">
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                FILTER BULAN:
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs bg-zinc-950 border border-[#27272A] rounded-none p-2 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="Semua">📅 Semua Bulan</option>
                {uniqueMonths.map((m) => (
                  <option key={m} value={m}>
                    📅 {getIndonesianMonthYear(m)}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Filter */}
            <div className="flex flex-col">
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                FILTER TANGGAL:
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-[#27272A] rounded-none p-2 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer text-left"
                  style={{ colorScheme: "dark" }}
                />
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate("")}
                    className="absolute right-2 top-2.5 text-zinc-400 hover:text-white font-bold"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Subcategory Filter rendered conditionally below if category has subcategories */}
          {selectedCategory !== "Semua" && categories[selectedCategory]?.subCategories && categories[selectedCategory].subCategories!.length > 0 && (
            <div className="flex flex-col border border-amber-900/40 bg-amber-955/5 p-2 animate-fade-in text-left">
              <label className="text-[9.5px] font-black text-amber-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                📂 FILTER SUB KATEGORI ({categories[selectedCategory].name.toUpperCase()}):
              </label>
              <select
                value={selectedSubCategory}
                onChange={(e) => setSelectedSubCategory(e.target.value)}
                className="text-xs bg-zinc-950 border border-zinc-855 rounded-none p-2 font-semibold text-zinc-200 focus:outline-none focus:border-amber-500 cursor-pointer font-sans"
              >
                <option value="Semua">📁 Semua Sub-Kategori</option>
                {categories[selectedCategory].subCategories!.map((subName) => (
                  <option key={subName} value={subName}>
                    📂 {subName}
                  </option>
                ))}
                <option value="Tanpa Sub">⚪ Tanpa Sub-Kategori / Lainnya</option>
              </select>
            </div>
          )}
        </div>

        {/* Toggle trigger buttons for Managing Categories inside Riwayat */}
        {onAddCategory && onUpdateCategory && onDeleteCategory && (
          <div className="pt-2 border-t border-zinc-850/60 mt-1">
            <button
              type="button"
              onClick={() => {
                setShowManageCategories(!showManageCategories);
                setEditingCatName(null);
                setManagingSubCatName(null);
              }}
              className={`w-full py-2 bg-zinc-950 hover:bg-[#1A1A1E] border text-[8.5px] font-black uppercase tracking-widest duration-150 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                showManageCategories ? "border-emerald-500 text-emerald-400 font-bold" : "border-[#27272A] text-zinc-400 hover:text-white"
              }`}
            >
              <span>{showManageCategories ? "✖ TUTUP KELOLA KATEGORI" : "⚙️ KELOLA KATEGORI & SUB-KATEGORI"}</span>
            </button>
          </div>
        )}

        {/* Collapsible Category Management Panel */}
        {showManageCategories && onAddCategory && onUpdateCategory && onDeleteCategory && (
          <div className="bg-[#0f0f11] border border-emerald-500/30 p-3.5 space-y-4 text-left animate-fade-in">
            {/* Header / Accent indicator */}
            <div className="border-b border-zinc-900 pb-2 flex justify-between items-center bg-zinc-950 px-2.5 py-1">
              <span className="text-[9.5px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                ⭐ INTEGRAL CONFIGURATION KATEGORI
              </span>
              <span className="text-[8px] font-mono text-zinc-550">Active: {Object.keys(categories).length}</span>
            </div>

            {/* Tambah Kategori Baru */}
            <div className="space-y-2.5">
              <div>
                <label className="block text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                  NAMA KATEGORI BARU:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Contoh: Operasional Mobil, Air minum"
                    className="flex-1 text-xs bg-zinc-950 border border-zinc-855 rounded-none py-2 px-2.5 font-bold text-zinc-255 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Color dots choice */}
              <div>
                <label className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                  WARNA AKSEN KATEGORI:
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { hex: "#10b981", label: "Hijau" },
                    { hex: "#fbbf24", label: "Kuning" },
                    { hex: "#f43f5e", label: "Merah" },
                    { hex: "#0ea5e9", label: "Biru" },
                    { hex: "#8b5cf6", label: "Ungu" },
                    { hex: "#d946ef", label: "Pink" },
                    { hex: "#38bdf8", label: "Sky Blue" },
                    { hex: "#a1a1aa", label: "Abu-abu" }
                  ].map((palette) => (
                    <button
                      key={palette.hex}
                      type="button"
                      onClick={() => setNewCatColor(palette.hex)}
                      className={`w-5 h-5 rounded-none border transition-all cursor-pointer ${
                        newCatColor === palette.hex ? "border-white scale-110" : "border-zinc-850 opacity-60 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: palette.hex }}
                      title={palette.label}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const clean = newCatName.trim();
                  if (!clean) {
                    alert("Tuliskan nama kategori terlebih dahulu!");
                    return;
                  }
                  if (categories[clean]) {
                    alert("Kategori dengan nama ini sudah ada!");
                    return;
                  }
                  onAddCategory(clean, newCatColor);
                  setNewCatName("");
                }}
                className="w-full py-2 bg-zinc-950 border border-emerald-800 hover:border-emerald-500 text-emerald-400 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest cursor-pointer"
              >
                + TAMBAH KATEGORI BARU
              </button>
            </div>

            {/* List entries */}
            <div className="border-t border-zinc-900 pt-3 space-y-2">
              <div className="flex justify-between items-center text-[8px] font-mono text-zinc-500 uppercase tracking-widest">
                <span>Daftar Kategori Aktif:</span>
                {onResetCategoriesToDefault && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onResetCategoriesToDefault) {
                        onResetCategoriesToDefault();
                      }
                    }}
                    className="text-[8px] text-[#00c070] hover:text-emerald-400 underline cursor-pointer font-bold uppercase tracking-wide"
                  >
                    Atur Ulang ke Default
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {Object.keys(categories).map((catName) => {
                  const spec = categories[catName];
                  const isEditingThisCat = editingCatName === catName;
                  const isManagingThisSub = managingSubCatName === catName;
                  const hasSubCount = spec.subCategories?.length || 0;

                  if (isEditingThisCat) {
                    return (
                      <div key={catName} className="bg-zinc-950 border border-emerald-500/40 p-2.5 space-y-2.5 animate-fade-in">
                        <div>
                          <label className="block text-[8px] text-emerald-400 font-black uppercase mb-1 font-mono">Nama Kategori:</label>
                          <input
                            type="text"
                            value={editNewName}
                            onChange={(e) => setEditNewName(e.target.value)}
                            className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-none py-1.5 px-2 font-semibold text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        
                        <div className="flex flex-col gap-2 xs:flex-row xs:justify-between xs:items-center">
                          <div>
                            <span className="block text-[8px] text-zinc-500 font-black uppercase mb-1 font-mono">Aksen:</span>
                            <div className="flex gap-1.5">
                              {[
                                "#10b981",
                                "#fbbf24",
                                "#f43f5e",
                                "#0ea5e9",
                                "#8b5cf6",
                                "#d946ef",
                                "#38bdf8",
                                "#a1a1aa"
                              ].map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setEditNewColor(c)}
                                  className={`w-3.5 h-3.5 rounded-none border transition-all ${
                                    editNewColor === c ? "border-white scale-110" : "border-transparent opacity-65"
                                  }`}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="flex gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const cleanNew = editNewName.trim();
                                if (!cleanNew) return;
                                onUpdateCategory(editingCatName, cleanNew, editNewColor);
                                setEditingCatName(null);
                              }}
                              className="px-2.5 py-1.5 bg-[#00c070] text-black text-[9px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-100 active:scale-95 border border-[#00a860]"
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCatName(null)}
                              className="px-2.5 py-1.5 bg-zinc-900 text-zinc-400 text-[9px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-100 hover:text-white border border-zinc-805"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={catName} className="border border-zinc-900 bg-zinc-950 p-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span 
                            className="w-2.5 h-2.5 inline-block shrink-0 rounded-none" 
                            style={{ backgroundColor: spec.color }} 
                          />
                          <span className="font-semibold text-zinc-200 text-[11px] truncate">{catName}</span>
                          {hasSubCount > 0 && (
                            <span className="text-[8px] bg-zinc-900 border border-zinc-850 text-zinc-450 px-1.5 py-0.2 shrink-0 font-bold scale-90 font-mono">
                              {hasSubCount} sub
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (isManagingThisSub) {
                                setManagingSubCatName(null);
                              } else {
                                setManagingSubCatName(catName);
                                setNewSubCatName("");
                              }
                            }}
                            className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider border cursor-pointer duration-100 ${
                              isManagingThisSub
                                ? "bg-amber-955/20 text-amber-500 border-amber-900"
                                : "bg-zinc-900 text-zinc-450 border-zinc-850 hover:text-white"
                            }`}
                          >
                            Sub ({hasSubCount})
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingCatName(catName);
                              setEditNewName(catName);
                              setEditNewColor(spec.color);
                            }}
                            className="px-1.5 py-0.5 text-emerald-455 bg-emerald-950/20 border border-zinc-850 text-[8px] font-black uppercase tracking-wider cursor-pointer hover:border-emerald-500 hover:text-white duration-100"
                          >
                            Ubah
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const performDelete = () => {
                                onDeleteCategory(catName);
                              };

                              if (triggerConfirm) {
                                triggerConfirm(
                                  "HAPUS KATEGORI",
                                  `Apakah Anda yakin ingin menghapus kategori "${catName}"? Transaksi dengan kategori ini akan secara otomatis disesuaikan ke Kategori Default.`,
                                  performDelete,
                                  true,
                                  "HAPUS",
                                  "BATAL"
                                );
                              } else if (confirm(`Hapus kategori "${catName}"?`)) {
                                performDelete();
                              }
                            }}
                            className="px-1.5 py-0.5 text-rose-500 bg-rose-955/10 border border-zinc-850 text-[8px] font-black uppercase tracking-wider cursor-pointer hover:bg-rose-950/20 hover:border-rose-500 hover:text-rose-455 duration-100"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>

                      {/* Sub-category list inside category detail */}
                      {isManagingThisSub && onUpdateSubCategories && (
                        <div className="bg-[#121214] border border-zinc-900 p-2.5 space-y-2 animate-fade-in text-left">
                          <span className="block text-[8px] font-black text-amber-500 uppercase tracking-widest border-b border-zinc-900 pb-1 font-mono">
                            📂 SUBS &rarr; {catName.toUpperCase()}
                          </span>

                          {/* Sub Category Chips */}
                          <div className="space-y-1.5">
                            {spec.subCategories && spec.subCategories.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {spec.subCategories.map((sub) => {
                                  const isEditingThisSub = editingSub?.catName === catName && editingSub?.oldName === sub;
                                  
                                  if (isEditingThisSub) {
                                    return (
                                      <div key={sub} className="flex items-center gap-1 bg-zinc-950 border border-amber-500/50 p-1 rounded-none scale-[1.01] transition-all">
                                        <input
                                          type="text"
                                          value={editingSub.currentInput}
                                          onChange={(e) => setEditingSub({ ...editingSub, currentInput: e.target.value })}
                                          className="text-[9px] bg-zinc-900 border border-zinc-800 text-white px-1 py-0.5 font-bold w-20 focus:outline-none focus:border-amber-500 font-sans"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              const cleanNew = editingSub.currentInput.trim();
                                              if (!cleanNew) return;
                                              if (cleanNew === sub) {
                                                setEditingSub(null);
                                                return;
                                              }
                                              const otherSubs = (spec.subCategories || []).filter(s => s !== sub);
                                              if (otherSubs.includes(cleanNew)) {
                                                alert("Sub-kategori sudah ada!");
                                                return;
                                              }
                                              onUpdateSubCategories(catName, [...otherSubs, cleanNew], { oldName: sub, newName: cleanNew });
                                              setEditingSub(null);
                                            } else if (e.key === "Escape") {
                                              setEditingSub(null);
                                            }
                                          }}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const cleanNew = editingSub.currentInput.trim();
                                            if (!cleanNew) return;
                                            if (cleanNew === sub) {
                                              setEditingSub(null);
                                              return;
                                            }
                                            const otherSubs = (spec.subCategories || []).filter(s => s !== sub);
                                            if (otherSubs.includes(cleanNew)) {
                                              alert("Sub-kategori sudah ada!");
                                              return;
                                            }
                                            onUpdateSubCategories(catName, [...otherSubs, cleanNew], { oldName: sub, newName: cleanNew });
                                            setEditingSub(null);
                                          }}
                                          className="text-emerald-500 hover:text-emerald-400 font-black text-[9px] px-0.5 cursor-pointer"
                                        >
                                          ✓
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingSub(null)}
                                          className="text-zinc-500 hover:text-zinc-400 font-extrabold text-[9px] px-0.5 cursor-pointer"
                                        >
                                          &times;
                                        </button>
                                      </div>
                                    );
                                  }

                                  return (
                                    <span 
                                      key={sub}
                                      className="inline-flex items-center gap-1 bg-zinc-950 text-zinc-350 border border-zinc-850 px-1.5 py-0.5 text-[9px] font-sans font-semibold rounded-none"
                                    >
                                      <span 
                                        className="cursor-pointer hover:text-amber-500 hover:underline flex items-center gap-0.5"
                                        onClick={() => setEditingSub({ catName, oldName: sub, currentInput: sub })}
                                        title="Ubah nama sub"
                                      >
                                        <span className="text-[7px]">✏️</span> {sub}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const performDeleteSub = () => {
                                            const filteredSub = (spec.subCategories || []).filter(s => s !== sub);
                                            onUpdateSubCategories(catName, filteredSub);
                                          };

                                          if (triggerConfirm) {
                                            triggerConfirm(
                                              "HAPUS SUB KATEGORI",
                                              `Apakah Anda yakin menghapus sub kategori "${sub}"? Biaya dengan sub ini akan tetap tercatat dengan sub kosong.`,
                                              performDeleteSub,
                                              true,
                                              "HAPUS",
                                              "BATAL"
                                            );
                                          } else if (confirm(`Hapus sub "${sub}"?`)) {
                                            performDeleteSub();
                                          }
                                        }}
                                        className="text-rose-500 hover:text-rose-400 hover:font-bold text-[8.5px] pl-1 font-mono cursor-pointer"
                                        title="Hapus sub-kategori ini"
                                      >
                                        &times;
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[9px] text-zinc-600 italic">Belum ada sub-kategori.</p>
                            )}
                          </div>

                          {/* Tambah Sub-Kategori Baru */}
                          <div className="flex gap-1 pt-1 border-t border-zinc-900 mt-2">
                            <input
                              type="text"
                              value={newSubCatName}
                              onChange={(e) => setNewSubCatName(e.target.value)}
                              placeholder="Tambah sub baru..."
                              className="flex-1 text-[10px] bg-zinc-950 border border-zinc-850 px-2 py-1 text-zinc-350 focus:outline-none focus:border-amber-500 font-sans"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const clean = newSubCatName.trim();
                                if (!clean) return;
                                const existing = spec.subCategories || [];
                                if (existing.includes(clean)) {
                                  alert("Sub-kategori sudah ada!");
                                  return;
                                }
                                onUpdateSubCategories(catName, [...existing, clean]);
                                setNewSubCatName("");
                              }}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-450 text-black text-[9px] font-black uppercase tracking-wider rounded-none cursor-pointer"
                            >
                              TAMBAH
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Dynamic calculation result */}
        <div className="flex justify-between items-center text-[10px] font-black text-[#10B981] bg-emerald-950/20 border border-emerald-800/40 rounded-none px-2.5 py-1.5 mt-1 uppercase tracking-wider">
          <span>TERFILTER: {filteredExpenses.length} TRANSAKSI</span>
          <span className="font-mono">Rp {totalFilteredAmount.toLocaleString("id-ID")}</span>
        </div>
      </div>

      {/* Expenses List Scrollable Part */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#0A0A0B]">
        {filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500 bg-[#121214] border border-[#27272A] rounded-none">
            <AlertCircle className="w-8 h-8 opacity-60 mb-2 text-zinc-600" />
            <p className="text-xs font-black text-white uppercase tracking-wider">Tidak ada pengeluaran ditemukan</p>
            <p className="text-[9.5px] text-zinc-500 mt-1 max-w-[210px] uppercase font-bold tracking-tight">Coba sesuaikan kata kunci pencarian atau ganti filter Anda.</p>
          </div>
        ) : (
          filteredExpenses.map((exp) => {
            const isEditing = editingId === exp.id;
            const categorySpec = categories[exp.category] || {
              name: exp.category,
              color: "#a1a1aa",
              bgColor: "bg-[#18181b] text-[#e4e4e7] border-[#27272a]",
              icon: "Coins"
            };

            if (isEditing) {
              return (
                <div key={exp.id} className="bg-zinc-950 border-2 border-emerald-500 rounded-none p-4 space-y-3 shadow-md animate-fade-in">
                  <div className="flex justify-between items-center pb-2 border-b border-[#27272A]">
                    <span className="text-[10px] uppercase font-black text-emerald-500 tracking-wider">✏️ Ubah Transaksi</span>
                    <button onClick={cancelEdit} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
                  </div>
                  
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-500 block mb-0.5">Nama Barang/Uraian</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full bg-[#121214] border border-[#27272A] rounded-none p-2 font-semibold text-zinc-200"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-black uppercase text-zinc-500 block mb-0.5">Jumlah Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={editQty}
                          onChange={(e) => handleEditQtyChange(parseInt(e.target.value, 10))}
                          className="w-full bg-[#121214] border border-[#27272A] rounded-none p-2 font-semibold text-zinc-205 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-zinc-500 block mb-0.5">Harga Satuan (Rp)</label>
                        <input
                          type="text"
                          value={editUnitPrice ? Number(editUnitPrice).toLocaleString("id-ID") : ""}
                          onChange={(e) => handleEditUnitPriceChange(e.target.value)}
                          className="w-full bg-[#121214] border border-[#27272A] rounded-none p-2 font-semibold text-zinc-205 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-black uppercase text-emerald-500 block mb-0.5">Total Nominal (Rp) *</label>
                        <input
                          type="text"
                          value={editAmount ? Number(editAmount).toLocaleString("id-ID") : ""}
                          onChange={(e) => handleEditAmountChange(e.target.value)}
                          className="w-full bg-zinc-900 border border-emerald-900/50 rounded-none p-2 font-semibold text-emerald-400 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-zinc-500 block mb-0.5">Tanggal</label>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="w-full bg-[#121214] border border-[#27272A] rounded-none p-1.5 font-semibold text-zinc-200"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-black uppercase text-zinc-500 block mb-0.5">Kategori</label>
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="w-full bg-[#121214] border border-[#27272A] rounded-none p-2 font-semibold text-zinc-200"
                        >
                          {Object.keys(categories).map((cat) => (
                            <option key={cat} value={cat}>
                              {categories[cat]?.name || cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-zinc-500 block mb-0.5">Lunas via</label>
                        <select
                          value={editPayment}
                          onChange={(e) => setEditPayment(e.target.value)}
                          className="w-full bg-[#121214] border border-[#27272A] rounded-none p-2 font-semibold text-zinc-200"
                        >
                          <option value="Tunai">Tunai</option>
                          <option value="Transfer Bank">Transfer Bank</option>
                          <option value="E-Wallet">E-Wallet</option>
                        </select>
                      </div>
                    </div>

                    {categories[editCategory]?.subCategories && categories[editCategory].subCategories!.length > 0 && (
                      <div className="animate-fade-in text-left">
                        <label className="text-[9px] font-black uppercase text-amber-500 block mb-0.5">Sub Kategori</label>
                        <select
                          value={editSubCategory}
                          onChange={(e) => setEditSubCategory(e.target.value)}
                          className="w-full bg-[#121214] border border-[#27272A] rounded-none p-2 font-semibold text-zinc-200"
                        >
                          {categories[editCategory].subCategories!.map((subName) => (
                            <option key={subName} value={subName}>
                              📂 {subName}
                            </option>
                          ))}
                          <option value="">Lainnya / Tanpa Sub-Kategori</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-500 block mb-0.5">Catatan Tambahan</label>
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full bg-[#121214] border border-[#27272A] rounded-none p-2 font-semibold text-zinc-200"
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => saveEdit(exp.id)}
                        className="flex-1 py-1.5 bg-emerald-500 text-black font-black uppercase rounded-none text-xs flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> Simpan Perubahan
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1.5 px-3 bg-zinc-900 hover:bg-zinc-850 border border-[#27272A] rounded-none text-zinc-300 font-bold"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={exp.id}
                onClick={() => setDetailExpense(exp)}
                className={`bg-[#121214] border rounded-none p-3.5 shadow-2xs hover:border-[#10B981]/50 cursor-pointer transition-all group relative overflow-hidden ${
                  exp.id === highlightExpenseId
                    ? "border-amber-500 ring-1 ring-amber-500/40 bg-amber-950/10"
                    : "border-[#27272A]"
                }`}
              >
                {exp.id === highlightExpenseId && (
                  <div className="absolute right-0 top-0 bg-amber-500 text-black font-black text-[7.5px] px-2 py-0.5 uppercase tracking-wider font-mono">
                    ✨ Referensi
                  </div>
                )}
                <div className="flex items-start gap-3">
                  {/* Category color icon wrapper */}
                  <div className={`w-10 h-10 rounded-none flex items-center justify-center border shrink-0 ${categorySpec.bgColor}`}>
                    <span className="text-base font-bold">
                      {getCategoryEmoji(exp.category)}
                    </span>
                  </div>

                  {/* Body textual information */}
                   <div className="flex-1 min-w-0 pr-12">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[8.5px] font-black tracking-widest uppercase border px-1.5 py-0.5 rounded-none ${categorySpec.bgColor}`}>
                        {categorySpec.name}
                      </span>
                      {exp.subCategory && (
                        <span className="text-[8px] font-black tracking-widest uppercase border border-amber-900 bg-amber-955/20 text-amber-500 px-1.5 py-0.5 rounded-none font-mono">
                          📂 {exp.subCategory}
                        </span>
                      )}
                      <span className="text-[8.5px] font-black text-zinc-400 flex items-center gap-0.5 uppercase tracking-wider">
                        <CreditCard className="w-2.5 h-2.5" /> {exp.paymentMethod}
                      </span>
                    </div>
                    
                    <h4 className="text-xs font-black text-white mt-1.5 truncate">
                      {exp.title}
                    </h4>

                    {exp.notes && (
                      <p className="text-[10px] text-zinc-500 font-bold italic mt-1 overflow-hidden text-ellipsis line-clamp-1">
                        &quot;{exp.notes}&quot;
                      </p>
                    )}

                    <div className="text-[9px] font-bold text-zinc-500 mt-1.5 flex items-center gap-1 font-mono">
                      <Calendar className="w-2.5 h-2.5 text-zinc-600" /> {exp.date}
                    </div>
                  </div>
                </div>

                {/* Right side Amount */}
                <div className="absolute right-3.5 top-3.5 text-right flex flex-col items-end">
                  <span className="text-xs font-black text-white font-mono">
                    Rp {exp.amount.toLocaleString("id-ID")}
                  </span>
                  {exp.qty !== undefined && exp.qty > 0 && (
                    <span className="text-[9.5px] font-extrabold text-amber-500/90 font-mono mt-0.5 tracking-tight">
                      {exp.qty} Pcs {exp.unitPrice !== undefined && `@ Rp ${exp.unitPrice.toLocaleString("id-ID")}`}
                    </span>
                  )}
                  
                  {/* Edit/Delete control trigger tabs */}
                  <div className="flex items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(exp);
                      }}
                      className="p-1 bg-zinc-950 hover:bg-emerald-500 border border-zinc-900 hover:border-emerald-600 hover:text-black text-zinc-400 transition-all cursor-pointer"
                      title="Ubah data"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (triggerConfirm) {
                          triggerConfirm(
                            "HAPUS TRANSAKSI BIAYA",
                            `Apakah Anda yakin ingin menghapus biaya "${exp.title}" secara permanen?`,
                            () => onDeleteExpense(exp.id),
                            true,
                            "HAPUS",
                            "BATAL"
                          );
                        } else {
                          onDeleteExpense(exp.id);
                        }
                      }}
                      className="p-1 bg-zinc-950 hover:bg-rose-600 border border-zinc-900 hover:border-rose-700 hover:text-white text-zinc-400 transition-all cursor-pointer"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail Bottom Sheet/Modal */}
      {detailExpense && (
        <div 
          className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4 animate-fade-in font-sans"
          onClick={() => setDetailExpense(null)}
        >
          <div 
            className="w-full max-w-[430px] bg-[#121214] border border-[#27272A] rounded-none overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#27272A] flex items-center justify-between bg-[#0A0A0B]">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-black text-emerald-450 uppercase tracking-widest block">📝 DETAIL TRANSAKSI BIAYA</span>
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
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-0.5">Jumlah Nominal</span>
                <span className="text-xl font-mono font-black text-rose-500">
                  Rp {detailExpense.amount.toLocaleString("id-ID")}
                </span>
                <h3 className="text-xs font-black text-white mt-2 leading-relaxed">
                  {detailExpense.title}
                </h3>
              </div>

              {/* Highlight Employee Name block if Gaji Karyawan */}
              {detailExpense.category === "Gaji Karyawan" && (() => {
                const empName = getEmployeeNameFromExpense(detailExpense.title, detailExpense.notes);
                return (
                  <div className="bg-[#062419] border border-[#10b981]/30 p-3 flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#10b981]/15 border border-[#10b981]/20 flex items-center justify-center shrink-0">
                      <span className="text-base text-emerald-400">👥</span>
                    </div>
                    <div>
                      <span className="text-[8.5px] font-black text-emerald-500 uppercase tracking-widest block">Nama Karyawan / Staf</span>
                      <span className="text-xs font-black text-white block mt-0.5">
                        {empName || "Staf Laundry"}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Specification Table */}
              <div className="bg-zinc-950/40 border border-zinc-900 p-3 space-y-2.5 text-xs font-semibold text-zinc-300">
                <div className="flex justify-between items-center border-b border-zinc-900/60 pb-2">
                  <span className="text-zinc-[450] text-[10px] text-zinc-500">Kategori</span>
                  <span className="text-zinc-200 uppercase bg-[#18181b] border border-zinc-800 px-2 py-0.5 text-[9px] font-bold">
                    👥 {detailExpense.category}
                  </span>
                </div>

                {detailExpense.subCategory && (
                  <div className="flex justify-between items-center border-b border-zinc-900/60 pb-2">
                    <span className="text-zinc-[450] text-[10px] text-zinc-500">Sub Kategori</span>
                    <span className="text-amber-500 uppercase bg-amber-955/20 border border-amber-900 px-2 py-0.5 text-[9px] font-bold">
                      📂 {detailExpense.subCategory}
                    </span>
                  </div>
                )}

                {detailExpense.qty !== undefined && detailExpense.qty > 0 && (
                  <div className="flex justify-between items-center border-b border-zinc-900/60 pb-2">
                    <span className="text-zinc-[450] text-[10px] text-zinc-500">Kuantitas (Qty)</span>
                    <span className="text-amber-500 uppercase bg-amber-955/25 border border-amber-800/60 px-2 py-0.5 text-[10px] font-black font-mono">
                      {detailExpense.qty} Pcs
                    </span>
                  </div>
                )}

                {detailExpense.qty !== undefined && detailExpense.qty > 0 && detailExpense.unitPrice !== undefined && (
                  <div className="flex justify-between items-center border-b border-zinc-900/60 pb-2">
                    <span className="text-zinc-[450] text-[10px] text-zinc-500">Harga Satuan</span>
                    <span className="text-zinc-200 font-mono text-[10.5px]">
                      Rp {detailExpense.unitPrice.toLocaleString("id-ID")}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center border-b border-zinc-900/60 pb-2">
                  <span className="text-zinc-[450] text-[10px] text-zinc-500">Tanggal Transaksi</span>
                  <span className="text-zinc-200 font-mono text-[10.5px]">
                    📅 {detailExpense.date}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-0.5">
                  <span className="text-zinc-[450] text-[10px] text-zinc-500">Metode Pembayaran</span>
                  <span className="text-zinc-200 uppercase bg-[#0c1e30] border border-[#38bdf8]/20 text-[#38bdf8] px-2 py-0.5 text-[9px] font-bold">
                    💳 {detailExpense.paymentMethod}
                  </span>
                </div>
              </div>

              {/* Notes / Description Details breakdown */}
              <div>
                <h5 className="text-[9.5px] font-black text-zinc-500 uppercase tracking-wider mb-1.5">Rincian & Catatan Biaya</h5>
                <div className="bg-zinc-950 border border-zinc-900 p-3 rounded-none text-[10.5px] text-zinc-300 leading-relaxed font-sans whitespace-pre-line text-left">
                  {detailExpense.notes ? (
                    detailExpense.notes.split(/(?<=\.|\:)\s+/).map((sentence, idx) => {
                      const trimSen = sentence.trim();
                      if (!trimSen) return null;
                      return (
                        <div key={idx} className="flex items-start gap-1.5 mt-1 border-b border-zinc-900/40 pb-1.5 last:border-b-0 last:pb-0 font-sans">
                          <span className="text-emerald-500 select-none">•</span>
                          <span>{trimSen}</span>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-zinc-550 italic font-medium">Tidak ada rincian catatan tambahan.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[#27272A] bg-[#0A0A0B] text-right">
              <button 
                onClick={() => setDetailExpense(null)}
                className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-none transition-all cursor-pointer"
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
