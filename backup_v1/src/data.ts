import { Expense, ExpenseCategory, CategorySpec } from "./types";

export const PREDEFINED_CATEGORIES: Record<ExpenseCategory, CategorySpec> = {
  "Detergen & Sabun": {
    name: "Detergen & Sabun",
    color: "#38bdf8", // bright sky
    bgColor: "bg-[#0c1e30] text-[#38bdf8] border-[#38bdf8]/30",
    icon: "Sparkles",
    subCategories: ["Sabun Liquid", "Pewangi Lavender", "Pewangi Sakura", "Detergen Bubuk"]
  },
  "Listrik & Air": {
    name: "Listrik & Air",
    color: "#fbbf24", // bright amber
    bgColor: "bg-[#2d220a] text-[#fbbf24] border-[#fbbf24]/30",
    icon: "Zap",
    subCategories: ["Listrik PLN", "Air PDAM", "Gas LPG 3kg", "Gas LPG 12kg"]
  },
  "Sewa & Utilitas": {
    name: "Sewa & Utilitas",
    color: "#a78bfa", // vivid violet
    bgColor: "bg-[#1f1035] text-[#a78bfa] border-[#a78bfa]/30",
    icon: "Home",
    subCategories: ["Sewa Ruko", "Internet WiFi", "Kebersihan", "Keamanan"]
  },
  "Gaji Karyawan": {
    name: "Gaji Karyawan",
    color: "#10b981", // vivid emerald green
    bgColor: "bg-[#062419] text-[#10b981] border-[#10b981]/30",
    icon: "Users",
    subCategories: ["Gaji Pokok", "Bonus / Lembur", "Uang Makan Helper"]
  },
  "Pemeliharaan Mesin": {
    name: "Pemeliharaan Mesin",
    color: "#f87171", // soft-red
    bgColor: "bg-[#2f1212] text-[#f87171] border-[#f87171]/20",
    icon: "Wrench",
    subCategories: ["Suku Cadang / Sparepart", "Servis Dinamo", "Vanbelt Mesin", "Teknisi Berkala"]
  },
  "Pemasaran & Iklan": {
    name: "Pemasaran & Iklan",
    color: "#f472b6", // pink
    bgColor: "bg-[#2e091a] text-[#f472b6] border-[#f472b6]/20",
    icon: "Megaphone",
    subCategories: ["Cetak Spanduk / X-Banner", "Penyebaran Brosur", "Iklan Facebook & Instagram"]
  },
  "Plastik": {
    name: "Plastik",
    color: "#d946ef", // bright fuchsia / pink
    bgColor: "bg-[#2d0a33] text-[#d946ef] border-[#d946ef]/30",
    icon: "Package",
    subCategories: ["Plastik 30", "Plastik 35", "Plastik 40", "Plastik 45", "Plastik 50", "Plastik 60", "Plastik 100", "Plastik 150"]
  },
  "Lain-lain": {
    name: "Lain-lain",
    color: "#a1a1aa", // cool gray
    bgColor: "bg-[#18181b] text-[#e4e4e7] border-[#27272a]",
    icon: "Coins",
    subCategories: ["Alat Tulis Kantor (ATK)", "Konsumsi Harian", "Transportasi Kurir"]
  }
};

export const INITIAL_EXPENSES: Expense[] = [];

export const SAMPLE_EXPENSES: Expense[] = [
  {
    id: "exp-1",
    title: "Detergen Liquid Wangi Lavender 20L",
    amount: 195000,
    category: "Detergen & Sabun",
    date: "2026-05-18",
    paymentMethod: "Tunai",
    notes: "Beli jerigen besar suplier utama"
  },
  {
    id: "exp-2",
    title: "Tagihan Air PDAM Bulan Mei",
    amount: 320000,
    category: "Listrik & Air",
    date: "2026-05-15",
    paymentMethod: "Transfer Bank",
    notes: "Pemakaian air 48 kubik"
  },
  {
    id: "exp-3",
    title: "Gaji Helper Laundry (Santi) - Minggu II",
    amount: 500000,
    category: "Gaji Karyawan",
    date: "2026-05-14",
    paymentMethod: "Tunai",
    notes: "Pembayaran upah mingguan tepat waktu"
  },
  {
    id: "exp-4",
    title: "Servis Vanbelt & Dinamo Pengering IPSO",
    amount: 250000,
    category: "Pemeliharaan Mesin",
    date: "2026-05-12",
    paymentMethod: "E-Wallet",
    notes: "Teknisi luar datang servis berkala"
  },
  {
    id: "exp-5",
    title: "Isi Ulang Gas Melon LPG 3kg x 4 Tabung",
    amount: 88000,
    category: "Listrik & Air",
    date: "2026-05-10",
    paymentMethod: "Tunai",
    notes: "Gas cadangan kompor & dryer"
  },
  {
    id: "exp-6",
    title: "Plastik Packing Laundry Jinjing Tebal 10kg",
    amount: 110000,
    category: "Detergen & Sabun",
    date: "2026-05-08",
    paymentMethod: "Transfer Bank",
    notes: "Plastik jinjing khusus laundry kiloan"
  },
  {
    id: "exp-7",
    title: "Iklan Brosur Promo Grand Opening Cabang",
    amount: 150000,
    category: "Pemasaran & Iklan",
    date: "2026-05-05",
    paymentMethod: "E-Wallet",
    notes: "Cetak 200 lembar brosur"
  }
];

export const INITIAL_BUDGET_LIMIT = 3000000; // Rp 3.000.000 per bulan
