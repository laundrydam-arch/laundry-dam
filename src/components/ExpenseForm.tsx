import React, { useState, useEffect } from "react";
import { Sparkles, Bot, PenTool, CheckCircle, RefreshCw, Smartphone, DollarSign, Calendar, Tag, CreditCard, ChevronRight, Check, Trash2, CircleDollarSign, ChevronDown } from "lucide-react";
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, getDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Expense, CategorySpec, Karyawan, Absensi, Izin, PencairanBonus } from "../types";

const formatRupiah = (value: string): string => {
  const clean = value.replace(/\D/g, "");
  if (!clean) return "";
  return Number(clean).toLocaleString("id-ID");
};

const parseRupiah = (value: string): number => {
  const clean = value.replace(/\D/g, "");
  return clean ? parseInt(clean, 10) : 0;
};

const formatIDR = (val: number): string => {
  return "Rp " + val.toLocaleString("id-ID");
};

interface ExpenseFormProps {
  onAddExpense: (expense: Omit<Expense, "id">) => void;
  onSetViewTab: (tab: string) => void;
  categories: Record<string, CategorySpec>;
  onAddCategory: (name: string, color: string, icon?: string) => void;
  onUpdateCategory: (oldName: string, newName: string, newColor: string) => void;
  onDeleteCategory: (catName: string) => void;
  onResetCategoriesToDefault: () => void;
  onUpdateSubCategories?: (
    catName: string, 
    subCats: string[], 
    renameMapping?: { oldName: string; newName: string }
  ) => void;
  triggerConfirm?: (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    isDangerous?: boolean,
    confirmText?: string,
    cancelText?: string
  ) => void;
  karyawans?: Karyawan[];
  ownerId?: string;
  expenses?: Expense[];
  onDeleteExpense?: (id: string) => void;
}

export function ExpenseForm({ 
  onAddExpense, 
  onSetViewTab, 
  categories, 
  onAddCategory, 
  onUpdateCategory,
  onDeleteCategory, 
  onResetCategoriesToDefault,
  onUpdateSubCategories,
  triggerConfirm,
  karyawans = [],
  ownerId,
  expenses = [],
  onDeleteExpense
}: ExpenseFormProps) {
  // Mode selection: "standard" for regular expense, "withdrawal" for early payroll cashout, "bonus" for manual bonus disbursement
  const [formMode, setFormMode] = useState<"standard" | "withdrawal" | "bonus">("standard");

  // Form states for Pencairan Bonus Mandiri / Terintegrasi
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusKaryawanId, setBonusKaryawanId] = useState("");
  const [bonusDate, setBonusDate] = useState(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  });
  const [bonusPaymentMethod, setBonusPaymentMethod] = useState("Transfer");
  const [bonusNotes, setBonusNotes] = useState("");
  const [filterKaryawanBonusId, setFilterKaryawanBonusId] = useState<string>("Semua");

  // Manual form input states
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [category, setCategory] = useState<string>(() => {
    const keys = Object.keys(categories);
    return keys.includes("Detergen & Sabun") ? "Detergen & Sabun" : (keys[0] || "Lain-lain");
  });
  const [subCategory, setSubCategory] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  });
  const [paymentMethod, setPaymentMethod] = useState("Tunai");
  const [notes, setNotes] = useState("");

  const handleQtyChange = (val: number) => {
    const safeQty = isNaN(val) || val < 1 ? 1 : val;
    setQty(safeQty);
    const parsedPrice = parseRupiah(unitPrice);
    const total = safeQty * parsedPrice;
    setAmount(total > 0 ? formatRupiah(String(total)) : "");
  };

  const handleUnitPriceChange = (val: string) => {
    setUnitPrice(val);
    const parsedPrice = parseRupiah(val);
    const total = qty * parsedPrice;
    setAmount(total > 0 ? formatRupiah(String(total)) : "");
  };

  const handleAmountChange = (val: string) => {
    setAmount(val);
    const parsedTotal = parseRupiah(val);
    const calculatedUnitPrice = qty > 0 ? Math.round(parsedTotal / qty) : parsedTotal;
    setUnitPrice(calculatedUnitPrice > 0 ? formatRupiah(String(calculatedUnitPrice)) : "");
  };

  // Wage early withdrawal states
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalPaymentMethod, setWithdrawalPaymentMethod] = useState("Transfer Bank");
  const [withdrawalDate, setWithdrawalDate] = useState(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  });

  // Attendance and Leave lists for selected staff calculations
  const [absensiList, setAbsensiList] = useState<Absensi[]>([]);
  const [izinList, setIzinList] = useState<Izin[]>([]);

  // Worker withdrawal specific states for standart category fallback
  const [isPencairanGaji, setIsPencairanGaji] = useState(false);
  const [selectedKaryawanId, setSelectedKaryawanId] = useState("");

  // Sub-category management inline states
  const [managingSubCatName, setManagingSubCatName] = useState<string | null>(null);
  const [newSubCatName, setNewSubCatName] = useState("");
  const [editingSub, setEditingSub] = useState<{ catName: string; oldName: string; currentInput: string } | null>(null);

  // Add category inline states
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#10b981");

  // Helper function to calculate current weekly cycle dates
  const getWeeklyPeriodDates = (refDate = new Date()) => {
    const d = new Date(refDate);
    const day = d.getDay(); 
    // Sunday (0) -> 4 days, Monday (1) -> 3 days, etc. to Thursday
    const daysUntilThursday = (4 - day + 7) % 7;
    
    const thursday = new Date(d);
    thursday.setDate(d.getDate() + daysUntilThursday);
    
    const friday = new Date(thursday);
    friday.setDate(thursday.getDate() - 6);
    
    const formatYMD = (dateObj: Date) => {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dayVal = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${dayVal}`;
    };

    const startStr = formatYMD(friday);
    const endStr = formatYMD(thursday);
    
    const formatted = `${friday.toLocaleDateString("id-ID", { day: "numeric", month: "long" })} - ${thursday.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;
    return { startStr, endStr, formatted, friday, thursday };
  };

  // Subscribe to real-time logs of selected owner's personnel metrics (attendance, leaves)
  useEffect(() => {
    if (!ownerId) return;
    const absRef = collection(db, "users", ownerId, "absensi");
    const unsubAbs = onSnapshot(absRef, (snap) => {
      const list: Absensi[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Absensi);
      });
      setAbsensiList(list);
    });

    const izRef = collection(db, "users", ownerId, "izin");
    const unsubIz = onSnapshot(izRef, (snap) => {
      const list: Izin[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Izin);
      });
      setIzinList(list);
    });

    return () => {
      unsubAbs();
      unsubIz();
    };
  }, [ownerId]);

  // Edit category inline states
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editNewName, setEditNewName] = useState("");
  const [editNewColor, setEditNewColor] = useState("");

  // Quick add subcategory inline states
  const [showQuickAddSub, setShowQuickAddSub] = useState(false);
  const [quickSubName, setQuickSubName] = useState("");

  const handleQuickAddSub = () => {
    const trimmed = quickSubName.trim();
    if (!trimmed) return;

    const currentSubs = categories[category]?.subCategories || [];
    if (currentSubs.includes(trimmed)) {
      alert("Sub-kategori ini sudah ada!");
      return;
    }

    const newSubs = [...currentSubs, trimmed];
    if (onUpdateSubCategories) {
      onUpdateSubCategories(category, newSubs);
    }
    setSubCategory(trimmed);
    setQuickSubName("");
    setShowQuickAddSub(false);
  };

  // Automatically select the first sub-category if available and default Gaji Karyawan settings
  useEffect(() => {
    const activeCat = categories[category];
    if (activeCat && activeCat.subCategories && activeCat.subCategories.length > 0) {
      setSubCategory(activeCat.subCategories[0]);
    } else {
      setSubCategory("");
    }

    if (category === "Gaji Karyawan" || category === "Kasbon Karyawan") {
      setIsPencairanGaji(true);
      if (karyawans && karyawans.length > 0) {
        setSelectedKaryawanId(karyawans[0].id);
      }
    } else {
      setIsPencairanGaji(false);
      setSelectedKaryawanId("");
    }
  }, [category, categories, karyawans]);

  // Handle auto-title for worker withdrawals
  useEffect(() => {
    if (isPencairanGaji && selectedKaryawanId) {
      const selected = karyawans.find(k => k.id === selectedKaryawanId);
      if (selected) {
        if (category === "Kasbon Karyawan") {
          setTitle(`Pemberian Kasbon: ${selected.nama}`);
        } else {
          setTitle(`Pencairan Gaji Staf: ${selected.nama}`);
        }
      }
    }
  }, [isPencairanGaji, selectedKaryawanId, karyawans, category]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseRupiah(amount);
    if (!title.trim() || parsedAmount <= 0) {
      alert("Harap isi deskripsi pengeluaran dan jumlah rupiah dengan benar!");
      return;
    }

    onAddExpense({
      title: title.trim(),
      amount: parsedAmount,
      category,
      subCategory: subCategory || undefined,
      date,
      paymentMethod,
      notes: notes.trim() || undefined,
      karyawanId: isPencairanGaji && selectedKaryawanId ? selectedKaryawanId : undefined,
      pencairanGaji: isPencairanGaji ? true : undefined,
      qty: qty > 0 ? qty : 1,
      unitPrice: parseRupiah(unitPrice) || parsedAmount
    });

    // Reset Form fields
    setTitle("");
    setAmount("");
    setQty(1);
    setUnitPrice("");
    setNotes("");
    setIsPencairanGaji(false);
    setSelectedKaryawanId("");
    
    // Redirect to Logs tab
    onSetViewTab("history");
  };

  const handleWithdrawalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseRupiah(withdrawalAmount);
    if (!selectedKaryawanId) {
      alert("Harap pilih staf karyawan terlebih dahulu!");
      return;
    }
    if (parsedAmount <= 0) {
      alert("Harap isi nominal pencairan dengan benar!");
      return;
    }

    const selectedKaryawan = karyawans.find((k) => k.id === selectedKaryawanId);
    if (!selectedKaryawan) return;

    onAddExpense({
      title: `Pencairan Gaji Staf: ${selectedKaryawan.nama}`,
      amount: parsedAmount,
      category: "Gaji Karyawan",
      subCategory: "Pencairan Gaji",
      date: withdrawalDate,
      paymentMethod: withdrawalPaymentMethod,
      notes: `Pencairan gaji awal/kasbon instan staf ${selectedKaryawan.nama} lewat kasir.`,
      karyawanId: selectedKaryawan.id,
      pencairanGaji: true
    });

    // Reset Form fields
    setWithdrawalAmount("");
    setSelectedKaryawanId("");
    
    // Redirect to Logs tab
    onSetViewTab("history");
  };

  const handleBonusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId) {
      alert("Error: ownerId tidak di-set.");
      return;
    }
    if (!bonusKaryawanId) {
      alert("Silakan pilih staf karyawan terlebih dahulu.");
      return;
    }
    const target = karyawans.find(c => c.id === bonusKaryawanId);
    if (!target) {
      alert("Staf Karyawan tidak ditemukan.");
      return;
    }
    const amountNum = parseRupiah(bonusAmount);
    if (amountNum <= 0) {
      alert("Masukkan jumlah bonus pencairan yang valid.");
      return;
    }
    
    const availableBonus = target.bonus || 0;
    if (amountNum > availableBonus) {
      alert(`Nominal pencairan (${formatIDR(amountNum)}) melebihi bonus tersedia (${formatIDR(availableBonus)}).`);
      return;
    }

    const processBonusDisb = async () => {
      const stafRef = doc(db, "users", ownerId, "karyawan", target.id);
      const newBonus = Math.max(0, availableBonus - amountNum);

      try {
        // 1. Deduct from Karyawan bonus in Firestore
        await setDoc(stafRef, {
          bonus: newBonus
        }, { merge: true });

        // 2. Create the linked Expense
        onAddExpense({
          title: `Pencairan Bonus Staf: ${target.nama}`,
          amount: amountNum,
          category: "Gaji Karyawan",
          subCategory: "Bonus / Lembur",
          date: bonusDate,
          paymentMethod: bonusPaymentMethod,
          notes: `Pencairan bonus staf lewat kasir. ${bonusNotes ? "Catatan: " + bonusNotes : ""}`,
          karyawanId: target.id,
          pencairanBonus: true,
        });

        // Reset inputs
        setBonusAmount("");
        setBonusNotes("");
        
        alert(`Berhasil mencairkan bonus ${target.nama} sebesar ${formatIDR(amountNum)}!\nSisa pending bonus staf sekarang: ${formatIDR(newBonus)}.`);
      } catch (err) {
        console.error("Gagal mencairkan bonus:", err);
        alert("Gagal melakukan pencairan bonus: " + (err instanceof Error ? err.message : String(err)));
      }
    };

    if (triggerConfirm) {
      triggerConfirm(
        "CAIRKAN BONUS STAF",
        `Apakah Anda yakin ingin mencairkan bonus untuk ${target.nama} sebesar ${formatIDR(amountNum)}?\n\n` +
        `Sistem akan: \n` +
        `1. Mengurangi parameter bonus pending staf sebanyak ${formatIDR(amountNum)}.\n` +
        `2. Membuat catatan pengeluaran "Gaji Karyawan" senilai ${formatIDR(amountNum)} tanpa memotong gaji dasar (tanpa potong gaji).`,
        processBonusDisb
      );
    } else {
      if (confirm(`Apakah Anda yakin ingin mencairkan bonus untuk ${target.nama} sebesar ${formatIDR(amountNum)}?`)) {
        await processBonusDisb();
      }
    }
  };

  const handleDeleteBonusDisbursement = async (item: Expense) => {
    if (!ownerId || !item.id) return;
    
    const processDelete = async () => {
      try {
        // 1. If it has a karyawanId, restore the bonus in the karyawan record!
        if (item.karyawanId && item.amount) {
          const stafRef = doc(db, "users", ownerId, "karyawan", item.karyawanId);
          const stafSnap = await getDoc(stafRef);
          if (stafSnap.exists()) {
            const stafData = stafSnap.data();
            const currentBonus = typeof stafData.bonus === "number" ? stafData.bonus : Number(stafData.bonus) || 0;
            const expAmount = typeof item.amount === "number" ? item.amount : Number(item.amount) || 0;
            const restoredBonus = currentBonus + expAmount;
            await setDoc(stafRef, { bonus: restoredBonus }, { merge: true });
          }
        }
        
        // 2. Delete the expense record
        if (onDeleteExpense) {
          await onDeleteExpense(item.id);
        }
        
        alert("Berhasil menghapus/membatalkan pencairan bonus dan mengembalikannya ke saldo pending bonus staf!");
      } catch (err) {
        console.error("Gagal menghapus pencairan bonus:", err);
        alert("Gagal menghapus pencairan bonus: " + (err instanceof Error ? err.message : String(err)));
      }
    };

    if (triggerConfirm) {
      triggerConfirm(
        "BATALKAN PENCAIRAN BONUS",
        `Apakah Anda yakin ingin membatalkan pencairan bonus ini?\n\n` +
        `Tindakan ini akan menghapus catatan pengeluaran ini dan mengembalikan nominal ${formatIDR(item.amount)} ke saldo pending bonus staf.`,
        processDelete,
        true
      );
    } else {
      if (confirm(`Apakah Anda yakin ingin membatalkan pencairan bonus ini? Sistem akan mengembalikan nominal ${formatIDR(item.amount)} ke saldo pending.`)) {
        await processDelete();
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 bg-[#0A0A0B] text-[#F4F4F5] animate-fade-in text-left">
      


      {formMode === "standard" && (
        <div className="bg-[#121214] border border-[#27272A] rounded-none p-4 shadow-xs">
          <div className="flex items-center gap-1.5 mb-4 border-b border-[#27272A] pb-2">
            <PenTool className="w-4 h-4 text-emerald-500" />
            <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
              FORMULIR PENGELUARAN LAUNDRY
            </h3>
          </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Item Name / Description */}
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                BARANG / DESKRIPSI PENGELUARAN *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-zinc-500 font-bold text-xs">✍</span>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="misal: Beli Detergen Liquid Sakura 10L"
                  className="w-full text-xs bg-zinc-950 border border-zinc-850 rounded-none py-2.5 pl-8 pr-3 font-semibold text-zinc-200 placeholder-zinc-650 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

          {/* Qty & Unit Price Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                JUMLAH BARANG (QUANTITY)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-zinc-500 font-bold text-xs">📦</span>
                <input
                  type="number"
                  min="1"
                  required
                  value={qty}
                  onChange={(e) => handleQtyChange(parseInt(e.target.value, 10))}
                  placeholder="1"
                  className="w-full text-xs bg-zinc-950 border border-zinc-855 rounded-none py-2.5 pl-8 pr-3 font-semibold text-zinc-200 placeholder-zinc-650 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                HARGA SATUAN (RUPIAH)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-zinc-500 font-black text-xs">Rp</span>
                <input
                  type="text"
                  value={unitPrice}
                  onChange={(e) => handleUnitPriceChange(e.target.value)}
                  placeholder="25.000"
                  className="w-full text-xs bg-zinc-950 border border-zinc-855 rounded-none py-2.5 pl-9 pr-3 font-semibold text-zinc-200 placeholder-zinc-650 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Amount and Calendar in two column grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1.5">
                TOTAL PENGELUARAN (RUPIAH) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-zinc-500 font-black text-xs">Rp</span>
                <input
                  type="text"
                  required
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="50.000"
                  className="w-full text-xs bg-zinc-900 border border-emerald-500/40 rounded-none py-2.5 pl-9 pr-3 font-semibold text-[#00c070] placeholder-zinc-650 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                TANGGAL PENGELUARAN *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-zinc-500 pointer-events-none">
                  <Calendar className="w-3.5 h-3.5" />
                </span>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      (e.currentTarget as any).showPicker?.();
                    } catch (err) {}
                  }}
                  className="w-full text-xs bg-zinc-950 border border-zinc-855 rounded-none py-2 pl-9 pr-2.5 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                />
              </div>
              <div className="flex gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    setDate(`${d.getFullYear()}-${month}-${day}`);
                  }}
                  className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 border transition-all cursor-pointer ${
                    date === (() => {
                      const d = new Date();
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const day = String(d.getDate()).padStart(2, '0');
                      return `${d.getFullYear()}-${month}-${day}`;
                    })()
                      ? "bg-emerald-950/40 text-emerald-400 border-emerald-800"
                      : "bg-zinc-950 text-zinc-500 border-zinc-850 hover:text-zinc-300 hover:border-zinc-800"
                  }`}
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 1);
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    setDate(`${d.getFullYear()}-${month}-${day}`);
                  }}
                  className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 border transition-all cursor-pointer ${
                    date === (() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const day = String(d.getDate()).padStart(2, '0');
                      return `${d.getFullYear()}-${month}-${day}`;
                    })()
                      ? "bg-emerald-950/40 text-emerald-400 border-emerald-800"
                      : "bg-zinc-950 text-zinc-500 border-zinc-850 hover:text-zinc-300 hover:border-zinc-800"
                  }`}
                >
                  Kemarin
                </button>
              </div>
            </div>
          </div>

          {/* Category Dropdown & Payment Method in two column grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  KATEGORI OPERASIONAL
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddCat(!showAddCat)}
                  className="text-[9px] text-emerald-400 hover:text-emerald-300 font-black uppercase tracking-wider cursor-pointer select-none active:scale-95"
                >
                  {showAddCat ? "[ TUTUP ]" : "[ + KATEGORI ]"}
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-zinc-500">
                  <Tag className="w-3.5 h-3.5" />
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-855 rounded-none py-2 pl-9 pr-2.5 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {Object.keys(categories).map((catName) => (
                    <option key={catName} value={catName}>
                      {categories[catName]?.name || catName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                METODE PEMBAYARAN
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-zinc-500">
                  <CreditCard className="w-3.5 h-3.5" />
                </span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-855 rounded-none py-2 pl-9 pr-2.5 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="Tunai">💰 Tunai</option>
                  <option value="Transfer Bank">🏦 Transfer Bank</option>
                  <option value="E-Wallet">📱 E-Wallet</option>
                </select>
              </div>
            </div>
          </div>

          {/* Conditional Salary Withdrawal Section */}
          {(category === "Gaji Karyawan" || category === "Kasbon Karyawan") && (
            <div className="bg-[#1C160C] border border-amber-600/30 p-3 space-y-2 text-left">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPencairanGaji"
                  checked={isPencairanGaji}
                  disabled={category === "Kasbon Karyawan"}
                  onChange={(e) => {
                    setIsPencairanGaji(e.target.checked);
                    if (e.target.checked && karyawans && karyawans.length > 0) {
                      setSelectedKaryawanId(karyawans[0].id);
                    } else {
                      setSelectedKaryawanId("");
                    }
                  }}
                  className="rounded text-amber-500 focus:ring-amber-500 bg-zinc-950 border-zinc-800"
                />
                <label htmlFor="isPencairanGaji" className="text-[10px] font-black text-amber-400 uppercase tracking-wider cursor-pointer">
                  {category === "Kasbon Karyawan" ? "Pencatatan Kasbon Karyawan (Dihubungkan Otomatis)" : "Pencairan Gaji / Kasbon Karyawan (Dipotong Otomatis)"}
                </label>
              </div>
              
              {isPencairanGaji && karyawans && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-[8px] font-black text-zinc-400 uppercase tracking-wider mb-1">
                      PILIH STAF KARYAWAN *
                    </label>
                    <select
                      value={selectedKaryawanId}
                      onChange={(e) => setSelectedKaryawanId(e.target.value)}
                      className="w-full text-xs bg-zinc-950 border border-zinc-850 rounded-none py-2 px-2.5 font-semibold text-zinc-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="">-- Pilih Staf --</option>
                      {karyawans.map(k => (
                        <option key={k.id} value={k.id}>{k.nama}</option>
                      ))}
                    </select>
                  </div>
                  
                  {selectedKaryawanId && (
                    <p className="text-[9.5px] text-zinc-400">
                      * Nominal pengeluaran ini sebesar <strong className="text-white">Rp {amount || "0"}</strong> akan otomatis dicatat sebagai <strong className="text-amber-500">pencairan gaji</strong> dan mengurangi take-home pay staf yang dipilih pada portal gaji.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sub category field */}
          <div className="bg-[#141416]/50 border border-[#27272A] p-2.5 space-y-1.5 animate-fade-in text-left">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-black text-amber-500 uppercase tracking-widest leading-none">
                PILIH SUB KATEGORI ({categories[category]?.name?.toUpperCase() || category.toUpperCase()})
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowQuickAddSub(!showQuickAddSub);
                  setQuickSubName("");
                }}
                className="text-[9px] bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 px-1.5 py-0.5 font-black uppercase tracking-wider border border-amber-500/20 cursor-pointer"
              >
                {showQuickAddSub ? "Batal" : "+ Tambah Isi Sub"}
              </button>
            </div>

            {!showQuickAddSub ? (
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-zinc-500 z-10">
                  <Tag className="w-3.5 h-3.5 text-amber-500" />
                </span>
                <select
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-855 rounded-none py-2 pl-9 pr-2.5 font-semibold text-zinc-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {(categories[category]?.subCategories || []).map((subName) => (
                    <option key={subName} value={subName}>
                      📂 {subName}
                    </option>
                  ))}
                  <option value="">Lainnya / Tanpa Sub-Kategori</option>
                </select>
              </div>
            ) : (
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="Ketik ukuran/nama sub (contoh: Plastik 80)"
                  value={quickSubName}
                  onChange={(e) => setQuickSubName(e.target.value)}
                  className="flex-1 text-xs bg-zinc-950 border border-zinc-855 rounded-none py-1.5 px-2.5 font-semibold text-zinc-200 focus:outline-none focus:border-amber-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleQuickAddSub();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleQuickAddSub}
                  className="px-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 duration-75"
                >
                  Ok
                </button>
              </div>
            )}
          </div>

          {/* Add category form inline */}
          {showAddCat && (
            <div className="bg-[#18181B] border border-zinc-800 p-3 space-y-3 animate-fade-in relative text-left">
              <span className="block text-[9px] font-black text-emerald-500 uppercase tracking-widest border-b border-zinc-800 pb-1">
                ➕ TAMBAH & KELOLA JALUR KATEGORI
              </span>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Nama Kategori (misal: Sewa Ruko)"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-850 rounded-none py-2 px-2.5 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
                
                {/* Warna Pilihan */}
                <div className="space-y-1">
                  <span className="block text-[8.5px] font-black text-zinc-500 uppercase tracking-wide">Pilih Warna Aksen:</span>
                  <div className="flex gap-2">
                    {[
                      { hex: "#10b981", label: "Hijau" },
                      { hex: "#fbbf24", label: "Kuning" },
                      { hex: "#f43f5e", label: "Merah" },
                      { hex: "#0ea5e9", label: "Biru" },
                      { hex: "#8b5cf6", label: "Ungu" },
                      { hex: "#d946ef", label: "Pink" }
                    ].map((palette) => (
                      <button
                        key={palette.hex}
                        type="button"
                        onClick={() => setNewCatColor(palette.hex)}
                        className={`w-5 h-5 rounded-none border transition-all ${
                          newCatColor === palette.hex ? "border-white scale-110" : "border-transparent opacity-60"
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
                    onAddCategory(clean, newCatColor);
                    setCategory(clean); // otomatis pilih kategori yang baru dibuat
                    setNewCatName("");
                    setShowAddCat(false);
                  }}
                  className="w-full py-1.5 bg-zinc-950 border border-emerald-800 hover:border-emerald-500 text-emerald-400 hover:text-white transition-all rounded-none text-[9.5px] font-black uppercase tracking-wider"
                >
                  Simpan Kategori Baru
                </button>
              </div>

              {/* List of current categories to delete */}
              <div className="border-t border-zinc-800 pt-2.5 mt-2.5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="block text-[8.5px] font-black text-zinc-500 uppercase tracking-wide">
                    Daftar Kategori Aktif ({Object.keys(categories).length}):
                  </span>
                  <button
                    type="button"
                    onClick={onResetCategoriesToDefault}
                    className="text-[8px] text-zinc-400 hover:text-white underline cursor-pointer"
                  >
                    Atur Ulang ke Default
                  </button>
                </div>
                
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {Object.keys(categories).length === 0 ? (
                    <p className="text-[9px] text-zinc-650 italic">Tidak ada kategori. Tambahkan di atas!</p>
                  ) : (
                    Object.entries(categories).map(([catName, spec]) => {
                      if (editingCatName === catName) {
                        return (
                          <div 
                            key={catName}
                            className="bg-zinc-900 border border-emerald-800 p-2 space-y-2.5 animate-fade-in"
                          >
                            <div>
                              <span className="block text-[8px] text-emerald-400 font-black uppercase mb-1">Nama Kategori:</span>
                              <input
                                type="text"
                                value={editNewName}
                                onChange={(e) => setEditNewName(e.target.value)}
                                className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded-none py-1.5 px-2 font-semibold text-white focus:outline-none focus:border-emerald-500 font-sans"
                              />
                            </div>
                            
                            <div className="flex flex-col gap-2 xs:flex-row xs:justify-between xs:items-center">
                              {/* Color swatch */}
                              <div>
                                <span className="block text-[8px] text-zinc-500 font-black uppercase mb-1">Aksen:</span>
                                <div className="flex gap-1.5">
                                  {[
                                    "#10b981",
                                    "#fbbf24",
                                    "#f43f5e",
                                    "#0ea5e9",
                                    "#8b5cf6",
                                    "#d946ef",
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

                              <div className="flex gap-1 justify-end mt-1 xs:mt-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cleanNew = editNewName.trim();
                                    if (!cleanNew) return;
                                    onUpdateCategory(editingCatName, cleanNew, editNewColor);
                                    setCategory((curr) => curr === editingCatName ? cleanNew : curr);
                                    setEditingCatName(null);
                                  }}
                                  className="px-2 py-1.5 bg-emerald-500 text-black text-[9px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-100 active:scale-95 border border-emerald-600"
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCatName(null)}
                                  className="px-2 py-1.5 bg-zinc-950 text-zinc-400 text-[9px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-100 hover:text-white border border-zinc-805"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const hasSubCount = spec.subCategories?.length || 0;
                      const isManagingThis = managingSubCatName === catName;

                      return (
                        <div key={catName} className="border border-zinc-900 bg-zinc-950 p-1.5 space-y-1.5 rounded-none">
                          <div className="flex items-center justify-between text-xs rounded-none">
                            <div className="flex items-center gap-2 min-w-0">
                              <span 
                                className="w-2.5 h-2.5 inline-block shrink-0 rounded-none" 
                                style={{ backgroundColor: spec.color }} 
                              />
                              <span className="font-semibold text-zinc-300 text-[11px] truncate">{catName}</span>
                              {hasSubCount > 0 && (
                                <span className="text-[8px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.2 shrink-0 font-bold scale-90 font-mono">
                                  {hasSubCount} sub
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              {/* Sub category manage button */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (isManagingThis) {
                                    setManagingSubCatName(null);
                                  } else {
                                    setManagingSubCatName(catName);
                                    setNewSubCatName("");
                                  }
                                }}
                                className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider border cursor-pointer ${
                                  isManagingThis
                                    ? "bg-amber-950/40 text-amber-400 border-amber-800"
                                    : "bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white border-zinc-800"
                                }`}
                                title="Kelola Sub Kategori"
                              >
                                Sub ({hasSubCount})
                              </button>

                              {/* Edit button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCatName(catName);
                                  setEditNewName(catName);
                                  setEditNewColor(spec.color);
                                }}
                                className="px-1.5 py-0.5 text-emerald-400 hover:text-emerald-200 text-[9px] font-black uppercase tracking-wider bg-emerald-950/20 hover:bg-emerald-950/50 border border-zinc-900 cursor-pointer"
                                title="Ubah Kategori"
                              >
                                Ubah
                              </button>

                              {/* Delete button */}
                              <button
                                type="button"
                                onClick={() => {
                                  const performDelete = () => {
                                    onDeleteCategory(catName);
                                    // If current chosen category is deleted, fallback to remaining or first
                                    setCategory((current) => {
                                      if (current === catName) {
                                        const remainingKeys = Object.keys(categories).filter(k => k !== catName);
                                        return remainingKeys[0] || "";
                                      }
                                      return current;
                                    });
                                  };

                                  if (triggerConfirm) {
                                    triggerConfirm(
                                      "HAPUS KATEGORI",
                                      `Apakah Anda yakin ingin menghapus kategori "${catName}"?`,
                                      performDelete,
                                      true,
                                      "HAPUS",
                                      "BATAL"
                                    );
                                  } else {
                                    performDelete();
                                  }
                                }}
                                className="px-1.5 py-0.5 text-rose-500 hover:text-rose-300 text-[9px] font-black uppercase tracking-wider bg-rose-950/10 hover:bg-rose-950/40 border border-zinc-900 cursor-pointer"
                                title="Hapus kategori ini"
                              >
                                Hapus
                              </button>
                            </div>
                          </div>

                          {/* Collapsible Sub-category editor */}
                          {isManagingThis && onUpdateSubCategories && (
                            <div className="bg-zinc-900 border border-zinc-800 p-2 space-y-2 animate-fade-in text-left">
                              <span className="block text-[8px] font-black text-amber-400 uppercase tracking-widest border-b border-zinc-800 pb-1">
                                📑 KELOLA SUB KATEGORI &rarr; {catName.toUpperCase()}
                              </span>
                              
                              {/* Sub categories pills list */}
                              <div className="space-y-1">
                                {spec.subCategories && spec.subCategories.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {spec.subCategories.map((sub) => {
                                      const isEditingThisSub = editingSub?.catName === catName && editingSub?.oldName === sub;
                                      
                                      if (isEditingThisSub) {
                                        return (
                                          <div key={sub} className="flex items-center gap-1 bg-zinc-950 border border-amber-500/50 p-1 rounded-none scale-[1.01] transition-all">
                                            <input
                                              type="text"
                                              value={editingSub.currentInput}
                                              onChange={(e) => setEditingSub({ ...editingSub, currentInput: e.target.value })}
                                              className="text-[9.5px] bg-zinc-900 border border-zinc-800 text-white px-1.5 py-0.5 rounded-none font-bold w-24 focus:outline-none focus:border-amber-500 font-sans"
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
                                                    alert("Nama sub-kategori ini sudah digunakan!");
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
                                                  alert("Nama sub-kategori ini sudah digunakan!");
                                                  return;
                                                }
                                                onUpdateSubCategories(catName, [...otherSubs, cleanNew], { oldName: sub, newName: cleanNew });
                                                setEditingSub(null);
                                              }}
                                              className="text-emerald-500 hover:text-emerald-400 font-extrabold text-[10px] px-1 cursor-pointer"
                                              title="Simpan"
                                            >
                                              ✓
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingSub(null)}
                                              className="text-zinc-500 hover:text-zinc-400 font-extrabold text-[10px] px-1 cursor-pointer"
                                              title="Batal"
                                            >
                                              &times;
                                            </button>
                                          </div>
                                        );
                                      }

                                      return (
                                        <span 
                                          key={sub}
                                          className="inline-flex items-center gap-1 bg-zinc-950 text-zinc-300 border border-zinc-800 px-1.5 py-0.5 text-[9px] font-sans font-semibold rounded-none"
                                        >
                                          <span 
                                            className="cursor-pointer hover:text-amber-400 font-bold flex items-center gap-1"
                                            onClick={() => setEditingSub({ catName, oldName: sub, currentInput: sub })}
                                            title="Klik untuk mengubah nama sub kategori"
                                          >
                                            <span className="text-[7.5px]">✏️</span> {sub}
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
                                                  `Apakah Anda mufakat menghapus sub kategori "${sub}"? Catatan pengeluaran lama yang memakai sub ini akan dibersihkan sub-kategorinya secara otomatis.`,
                                                  performDeleteSub,
                                                  true,
                                                  "HAPUS",
                                                  "BATAL"
                                                );
                                              } else {
                                                performDeleteSub();
                                              }
                                            }}
                                            className="text-rose-500 hover:text-rose-300 font-extrabold focus:outline-none cursor-pointer ml-1 text-xs"
                                            title="Hapus sub kategori ini"
                                          >
                                            &times;
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-[8.5px] text-zinc-500 italic py-1">Belum ada sub kategori.</p>
                                )}
                              </div>

                              {/* Save/Add input */}
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  placeholder="Tambah sub: misal plastik 30"
                                  value={newSubCatName}
                                  onChange={(e) => setNewSubCatName(e.target.value)}
                                  className="flex-1 text-[10px] bg-zinc-950 border border-zinc-800 py-1 px-2.5 font-semibold text-white focus:outline-none focus:border-amber-500 font-sans"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cleanSub = newSubCatName.trim();
                                    if (!cleanSub) return;
                                    const currentSubs = spec.subCategories || [];
                                    if (currentSubs.includes(cleanSub)) {
                                      alert("Sub-kategori ini sudah terdaftar!");
                                      return;
                                    }
                                    onUpdateSubCategories(catName, [...currentSubs, cleanSub]);
                                    setNewSubCatName("");
                                  }}
                                  className="px-2 py-1 bg-amber-500 text-black text-[9px] font-black uppercase tracking-wider cursor-pointer border border-amber-600 rounded-none"
                                >
                                  TAMBAH
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          )}

          {/* Optional notes */}
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
              CATATAN EKSTRA (OPSIONAL)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="misal: merk SoKlin liquid, beli di agen kelontong jaya"
              className="w-full text-xs bg-zinc-950 border border-zinc-855 rounded-none py-2.5 px-3 font-semibold text-zinc-200 placeholder-zinc-650 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Action Trigger Submit */}
          <button
            type="submit"
            className="w-full mt-4 py-3.5 bg-emerald-500 text-black text-xs font-black tracking-widest uppercase rounded-none hover:bg-emerald-450 transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:scale-98"
          >
            <Check className="w-4 h-4" /> SIMPAN DATA TRANSAKSI
          </button>
        </form>
      </div>
      )}

      {/* 3. Structured Withdrawal Form */}
      {formMode === "withdrawal" && (
        <div className="bg-[#121214] border border-[#27272A] rounded-none p-4 shadow-xs animate-fade-in text-left">
          <div className="flex items-center gap-1.5 mb-4 border-b border-[#27272A] pb-2">
            <span className="text-emerald-500 text-sm">⚡</span>
            <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
              FORMULIR PENCAIRAN GAJI AWAL STAF
            </h3>
          </div>

          <form onSubmit={handleWithdrawalSubmit} className="space-y-4">
            {/* PILIH STAF / KARYAWAN * */}
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                PILIH STAF / KARYAWAN *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-zinc-400 pointer-events-none text-xs">
                  👤
                </span>
                <select
                  required
                  value={selectedKaryawanId}
                  onChange={(e) => {
                    setSelectedKaryawanId(e.target.value);
                  }}
                  className="w-full text-xs bg-zinc-950 border border-zinc-850 rounded-none py-2.5 pl-8 pr-3.5 font-bold text-zinc-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">-- Pilih Staf Karyawan --</option>
                  {(karyawans || []).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama} ({k.username})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* LIVE DATA CARD (Only show when staff is selected) */}
            {selectedKaryawanId && (() => {
              const selectedStaf = karyawans.find((k) => k.id === selectedKaryawanId);
              if (!selectedStaf) return null;

              const weeklyPeriod = getWeeklyPeriodDates();
              const countHadir = absensiList.filter(
                (a) => a.karyawanId === selectedStaf.id && a.tanggal >= weeklyPeriod.startStr && a.tanggal <= weeklyPeriod.endStr
              ).length;

              const countLiburDisetujui = izinList
                .filter(
                  (iz) => iz.karyawanId === selectedStaf.id && iz.status === "Disetujui" && (iz.tanggalSelesai || iz.tanggal) >= weeklyPeriod.startStr && iz.tanggal <= weeklyPeriod.endStr
                )
                .reduce((acc, iz) => acc + (iz.jumlahHari || 1), 0);

              const weeklyBaseSalary = selectedStaf.gajiPokok / 4;
              const totalMakan = countHadir * selectedStaf.uangMakan;

              // Calculate dynamic salary withdrawals (Pencairan Gaji) from expenses!
              const pencairanGajiList = (expenses || []).filter((exp) => {
                if (!exp) return false;
                const titleLower = (exp.title || "").toLowerCase();
                const subCategoryLower = (exp.subCategory || "").toLowerCase();

                // Do not deduct if title or subCategory contains "bonus", "lembur", "rutin", "pokok", or "gaji mingguan staf"
                if (
                  subCategoryLower.includes("bonus") || 
                  subCategoryLower.includes("lembur") || 
                  subCategoryLower.includes("rutin") ||
                  subCategoryLower.includes("pokok") ||
                  titleLower.includes("bonus") || 
                  titleLower.includes("lembur") ||
                  titleLower.includes("gaji mingguan staf") ||
                  titleLower.includes("gaji pokok")
                ) {
                  return false;
                }

                // If karyawanId matches and it represents a salary withdrawal/advance/kasbon
                if (exp.karyawanId === selectedStaf.id) {
                  return exp.date >= weeklyPeriod.startStr && exp.date <= weeklyPeriod.endStr;
                }

                // If categorized as Gaji Karyawan with the specific staff payout title
                const nameLower = selectedStaf.nama.toLowerCase();
                if (exp.category === "Gaji Karyawan" && titleLower.includes(`pencairan gaji staf: ${nameLower}`)) {
                  return exp.date >= weeklyPeriod.startStr && exp.date <= weeklyPeriod.endStr;
                }

                return false;
              });
              const totalPencairan = pencairanGajiList.reduce((sum, exp) => sum + exp.amount, 0);

              const estimasiSisa = weeklyBaseSalary + totalMakan + (selectedStaf.bonus || 0) - (selectedStaf.kasbon || 0) - totalPencairan;

              return (
                <div className="border border-[#27272A] p-4 bg-zinc-950/60 font-sans space-y-3 animate-fade-in relative text-left">
                  <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                      PARAMETER SLIP GAJI SAAT INI
                    </span>
                    <span className="border border-emerald-500/50 text-emerald-400 text-[8px] font-black uppercase px-2 py-0.5 tracking-wider">
                      SIKLUS AKTIF
                    </span>
                  </div>

                  <div className="space-y-2 text-xs font-semibold text-zinc-350 font-mono">
                    <div className="flex justify-between">
                      <span className="text-zinc-400 font-sans">Gaji Pokok Mingguan (1/4):</span>
                      <span className="text-white">{formatIDR(weeklyBaseSalary)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-zinc-400 font-sans">Total Uang Makan ({countHadir} Hari):</span>
                      <span className="text-white">{formatIDR(totalMakan)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-zinc-400 font-sans">Bonus Minggu Ini:</span>
                      <span className="text-emerald-450 font-bold">+ {formatIDR(selectedStaf.bonus || 0)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-zinc-400 font-sans">Kasbon Terutang:</span>
                      <span className="text-rose-500 font-bold">- {formatIDR(selectedStaf.kasbon || 0)}</span>
                    </div>

                    <div className="flex justify-between border-t border-dashed border-zinc-900 pt-2 pb-1 bg-zinc-950/20">
                      <span className="text-zinc-400 font-sans">Sudah Dicairkan Awal:</span>
                      <span className="text-rose-500 font-bold">- {formatIDR(totalPencairan)}</span>
                    </div>

                    <div className="flex justify-between border-t border-zinc-850 pt-3 items-center">
                      <span className="text-zinc-100 font-sans font-bold uppercase text-[10px] tracking-wider">
                        Estimasi Sisa Sisa Gaji:
                      </span>
                      <span className="text-emerald-400 text-sm font-extrabold font-sans">
                        {formatIDR(estimasiSisa)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Inputs grid (Nominal & Metode side-by-side) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  NOMINAL PENCAIRAN (RUPIAH) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-550 font-bold text-xs">Rp</span>
                  <input
                    type="text"
                    required
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(formatRupiah(e.target.value))}
                    placeholder="300.000"
                    className="w-full text-xs bg-zinc-950 border border-zinc-850 rounded-none py-2.5 pl-8 pr-3 font-semibold text-zinc-200 placeholder-zinc-650 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  METODE PENCAIRAN *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-500 pointer-events-none text-xs">
                    💳
                  </span>
                  <select
                    value={withdrawalPaymentMethod}
                    onChange={(e) => setWithdrawalPaymentMethod(e.target.value)}
                    className="w-full text-xs bg-zinc-950 border border-zinc-855 rounded-none py-2.5 pl-8 pr-2.5 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Transfer Bank">🏦 Transfer Bank</option>
                    <option value="Tunai">💰 Tunai</option>
                    <option value="E-Wallet">📱 E-Wallet</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Date input for accuracy */}
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                TANGGAL PENCAIRAN GAJI *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-zinc-500 pointer-events-none">
                  <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                </span>
                <input
                  type="date"
                  required
                  value={withdrawalDate}
                  onChange={(e) => setWithdrawalDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      (e.currentTarget as any).showPicker?.();
                    } catch (err) {}
                  }}
                  className="w-full text-xs bg-zinc-950 border border-[#27272A] rounded-none py-2.5 pl-8 pr-2.5 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-4 py-3.5 bg-emerald-500 text-black text-xs font-black tracking-widest uppercase rounded-none hover:bg-emerald-450 transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:scale-98 font-sans animate-pulse"
            >
              <Check className="w-4 h-4 text-black font-extrabold" /> CATAT PENCAIRAN GAJI AWAL
            </button>
          </form>
        </div>
      )}

      {formMode === "bonus" && (
        <div className="flex flex-col gap-5 text-left items-stretch">
          
          {/* KOLOM ATAS: FORMULIR PENCAIRAN BONUS */}
          <div className="bg-[#121214] border border-[#27272A] rounded-none p-4 shadow-xs space-y-4">
            <div className="flex items-center gap-1.5 mb-2 border-b border-[#27272A] pb-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
                FORMULIR PENCAIRAN BONUS STAF (TERINTEGRASI GAJI)
              </h3>
            </div>

            <form onSubmit={handleBonusSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  Pilih Staf Penerima *
                </label>
                <select
                  required
                  value={bonusKaryawanId}
                  onChange={(e) => {
                    setBonusKaryawanId(e.target.value);
                    const selected = karyawans.find(k => k.id === e.target.value);
                    if (selected) {
                      setBonusAmount((selected.bonus || 0).toString());
                    }
                  }}
                  className="w-full text-xs bg-zinc-950 border border-[#27272A] rounded-none py-2.5 px-3 font-semibold text-zinc-200 outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">-- Pilih Staf --</option>
                  {karyawans.map((staf) => (
                    <option key={staf.id} value={staf.id}>
                      {staf.nama} (Bonus Pending: {formatIDR(staf.bonus || 0)})
                    </option>
                  ))}
                </select>
              </div>

              {bonusKaryawanId && (() => {
                const selected = karyawans.find((k) => k.id === bonusKaryawanId);
                if (!selected) return null;
                return (
                  <div className="p-3.5 bg-emerald-100 border-l-4 border-l-emerald-500 rounded-none font-sans text-xs space-y-1.5 shadow-xs text-emerald-950 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[10px] tracking-wider uppercase text-emerald-900">
                        SALDO BONUS TERSEDIA (PENDING):
                      </span>
                      <strong className="text-sm font-mono font-black text-emerald-850 bg-white/95 px-2.5 py-0.5 border border-emerald-300">
                        {formatIDR(selected.bonus || 0)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-900">
                        GAJI POKOK BULANAN:
                      </span>
                      <strong className="font-mono text-emerald-850">
                        {formatIDR(selected.gajiPokok)}
                      </strong>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  NOMINAL PENCAIRAN BONUS (RUPIAH) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-500 font-mono font-bold text-xs">
                    Rp
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="0"
                    value={bonusAmount ? formatRupiah(bonusAmount) : ""}
                    onChange={(e) => setBonusAmount(e.target.value.replace(/\D/g, ""))}
                    className="w-full text-xs bg-zinc-950 border border-[#27272A] rounded-none py-2.5 pl-8 pr-2.5 font-bold font-mono text-emerald-400 focus:outline-none focus:border-emerald-500 placeholder-zinc-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  METODE PENCAIRAN *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["Transfer", "Tunai", "QRIS"].map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setBonusPaymentMethod(method)}
                      className={`py-2 text-[10px] font-extrabold uppercase tracking-wide border transition-all duration-150 cursor-pointer ${
                        bonusPaymentMethod === method
                          ? "bg-zinc-900 border-emerald-500 text-emerald-400 font-black"
                          : "bg-zinc-950 border-[#27272A] text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  KETERANGAN / CATATAN (OPSIONAL)
                </label>
                <textarea
                  placeholder="Misal: Bon pembelian sabun/bonus omset laundry"
                  value={bonusNotes}
                  onChange={(e) => setBonusNotes(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-[#27272A] rounded-none py-2 px-3 text-zinc-200 focus:outline-none focus:border-emerald-500 h-16 resize-none"
                />
              </div>

              <div className="bg-amber-50 p-3.5 border-l-4 border-l-amber-500 border border-amber-200 text-xs text-amber-950 leading-relaxed font-sans shadow-xs">
                <span className="font-extrabold text-amber-900 flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider">
                  ⚠️ PANDUAN INTEGRASI GAJI (BEBAS POTONGAN):
                </span>
                Pencairan bonus ini otomatis tercatat sebagai transaksi pengeluaran laundry di kategori <strong className="text-emerald-800 font-extrabold">"Gaji Karyawan"</strong>. 
                Pencairan ini <span className="text-rose-900 font-black">TIDAK AKAN memotong gaji pokok, uang makan, atau saldo kehadiran staff</span> (tanpa potong gaji) pada slip penggajian, melainkan langsung mengurangi parameter bonus pending staf di sistem database.
              </div>

              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  TANGGAL PENCAIRAN *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-500 pointer-events-none">
                    <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                  </span>
                  <input
                    type="date"
                    required
                    value={bonusDate}
                    onChange={(e) => setBonusDate(e.target.value)}
                    onClick={(e) => {
                      try {
                        (e.currentTarget as any).showPicker?.();
                      } catch (err) {}
                    }}
                    className="w-full text-xs bg-zinc-950 border border-[#27272A] rounded-none py-2.5 pl-8 pr-2.5 font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-4 py-3.5 bg-emerald-500 text-black text-xs font-black tracking-widest uppercase rounded-none hover:bg-emerald-450 transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:scale-98 font-sans"
              >
                <Check className="w-4 h-4 text-black font-extrabold" /> PROSES PENCAIRAN BONUS
              </button>
            </form>
          </div>

          {/* KOLOM BAWAH: CEK / RIWAYAT PENCAIRAN BONUS MASING-MASING KARYAWAN */}
          <div className="bg-[#121214] border border-[#27272A] rounded-none p-4 shadow-xs space-y-4 flex flex-col min-h-[300px]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#27272A] pb-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
                  RIWAYAT & PILTER PENCAIRAN BONUS
                </h3>
              </div>
              <select
                value={filterKaryawanBonusId}
                onChange={(e) => setFilterKaryawanBonusId(e.target.value)}
                className="bg-zinc-950 border border-[#27272A] text-zinc-300 text-[10px] font-bold px-2.5 py-1.5 outline-none focus:border-emerald-500 cursor-pointer rounded-none"
              >
                <option value="Semua">Semua Staf Karyawan</option>
                {karyawans.map((staf) => (
                  <option key={staf.id} value={staf.id}>
                    {staf.nama}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 max-h-[550px] pr-1 scrollbar-thin">
              {(() => {
                // Filter expense objects for bonus pencairan
                const bonusExpenses = expenses.filter((exp) => {
                  const isBonus = exp.pencairanBonus === true || 
                    (exp.category === "Gaji Karyawan" && 
                     exp.subCategory === "Bonus / Lembur" && 
                     exp.title.includes("Pencairan Bonus"));

                  if (!isBonus) return false;
                  if (filterKaryawanBonusId !== "Semua" && exp.karyawanId !== filterKaryawanBonusId) return false;
                  return true;
                });

                // Sort newest date first
                const sorted = [...bonusExpenses].sort((a, b) => {
                  return new Date(b.date).getTime() - new Date(a.date).getTime();
                });

                if (sorted.length === 0) {
                  return (
                    <div className="text-center py-16 border border-dashed border-[#27272A] bg-zinc-950/20">
                      <p className="text-[10px] uppercase font-mono text-zinc-500 font-extrabold tracking-widest">
                        Tidak Ada Riwayat Pencairan
                      </p>
                      <p className="text-[9px] text-zinc-650 mt-1 font-sans">
                        Gunakan kolom kiri untuk memproses pencairan bonus staf.
                      </p>
                    </div>
                  );
                }

                return sorted.map((item) => {
                  const targetStaf = karyawans.find((k) => k.id === item.karyawanId);
                  const stafName = targetStaf?.nama || item.title.replace("Pencairan Bonus Staf: ", "") || "Staf";
                  return (
                    <div
                      key={item.id}
                      className="bg-zinc-950 border border-zinc-900 border-l-4 border-l-emerald-500 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs font-mono hover:border-zinc-800 transition-all shadow-xs"
                    >
                      <div className="space-y-1 text-left">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] uppercase font-black text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 border border-emerald-900/20 tracking-wider">
                            {stafName}
                          </span>
                          <span className="text-zinc-500 text-[10px]">
                            📅 {item.date}
                          </span>
                          <span className="text-zinc-500 text-[10px] bg-zinc-900 border border-zinc-850 px-1.5 py-0.2 tracking-tight">
                            {item.paymentMethod}
                          </span>
                        </div>
                        <div className="text-zinc-300">
                          Jumlah: <strong className="text-emerald-400 font-black">{formatIDR(item.amount)}</strong>
                        </div>
                        {item.notes ? (
                          <div className="text-[9px] text-zinc-500 leading-normal italic line-clamp-2 max-w-sm ml-0.5">
                            Ket: {item.notes}
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteBonusDisbursement(item)}
                        className="p-1 px-2 border border-zinc-900 bg-[#121214] text-zinc-500 hover:text-red-400 hover:border-red-950 hover:bg-red-950/20 transition-all font-sans text-[10px] font-extrabold uppercase flex items-center justify-center gap-1 self-start sm:self-center cursor-pointer"
                        title="Hapus pencairan dan kembalikan saldo pending bonus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>BATALKAN</span>
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

        </div>
      )}

      {/* Helpful Quick Category Guides */}
      <div className="bg-[#121214] border border-[#27272A] p-4 rounded-none">
        <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2 border-b border-[#27272A] pb-1.5">
          ℹ️ REFERENSI KATALOG BIAYA
        </h4>
        <div className="grid grid-cols-1 gap-2.5 text-[10px] text-zinc-400">
          <div className="flex flex-col">
            <span className="font-black text-zinc-300 uppercase tracking-wider">Detergen & Sabun:</span>
            <span>Pembelian sabun cair, softener, pewangi parfum laundry, plastik packing, pemutih.</span>
          </div>
          <div className="flex flex-col">
            <span className="font-black text-zinc-300 uppercase tracking-wider">Listrik & Air:</span>
            <span>Token PLN, gas LPG 3kg/casing untuk dryer, tagihan PDAM.</span>
          </div>
          <div className="flex flex-col">
            <span className="font-black text-zinc-300 uppercase tracking-wider">Pemeliharaan Mesin:</span>
            <span>Servis washer/dryer IPSO, reparasi setrika uap, ganti seal air.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
