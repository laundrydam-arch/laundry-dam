import React, { useState, useEffect } from "react";
import { Search, Filter, Trash2, Edit3, X, Check, Calendar, CreditCard, Tag, Sparkles, AlertCircle } from "lucide-react";
import { Expense, CategorySpec } from "../types";

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
}

export function ExpenseHistory({ expenses, categories, onDeleteExpense, onUpdateExpense, triggerConfirm }: ExpenseHistoryProps) {
  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Semua");
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>("Semua");
  const [selectedPayment, setSelectedPayment] = useState<string>("Semua");

  // Reset selected sub category when category filter changes
  useEffect(() => {
    setSelectedSubCategory("Semua");
  }, [selectedCategory]);
  
  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState<string>("Detergen & Sabun");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPayment, setEditPayment] = useState("");
  const [editNotes, setEditNotes] = useState("");

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
  };

  const cancelEdit = () => {
    setEditingId(null);
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
      notes: editNotes.trim() || undefined
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
    
    return matchSearch && matchCategory && matchPayment && matchSubCategory;
  });

  const totalFilteredAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

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
                        <label className="text-[9px] font-black uppercase text-zinc-500 block mb-0.5">Nominal (Rp)</label>
                        <input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-full bg-[#121214] border border-[#27272A] rounded-none p-2 font-semibold text-zinc-200"
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
                className="bg-[#121214] border border-[#27272A] rounded-none p-3.5 shadow-2xs hover:border-[#38bdf8]/30 transition-all group relative overflow-hidden"
              >
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
                  
                  {/* Edit/Delete control trigger tabs */}
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      onClick={() => startEdit(exp)}
                      className="p-1 bg-zinc-950 hover:bg-emerald-500 border border-zinc-900 hover:border-emerald-600 hover:text-black text-zinc-400 transition-all cursor-pointer"
                      title="Ubah data"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
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
    </div>
  );
}
