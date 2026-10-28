/**
 * TypeScript Interfaces for Laundry Expense Tracker
 */

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  subCategory?: string;
  date: string;
  paymentMethod: string;
  notes?: string;
  karyawanId?: string;
  pencairanGaji?: boolean;
  pencairanBonus?: boolean;
  qty?: number;
  unitPrice?: number;
}

export type ExpenseCategory = 
  | "Detergen & Sabun" 
  | "Listrik & Air" 
  | "Sewa & Utilitas" 
  | "Gaji Karyawan" 
  | "Pemeliharaan Mesin" 
  | "Pemasaran & Iklan" 
  | "Plastik"
  | "Kasbon Karyawan"
  | "Lain-lain";

export interface CategorySpec {
  name: string;
  color: string;
  bgColor: string;
  icon: string; // lucide icon name string representation
  subCategories?: string[];
}

export interface Budget {
  limit: number;
}

export interface LocationConfig {
  latitude: number;
  longitude: number;
  radius: number;
  namaLokasi: string;
  alamatLokasi?: string;
  teleponLokasi?: string;
  jamBukaLokasi?: string;
  ketentuanNota?: string;
}

export type ShiftType = "pagi" | "siang" | "tidak_ada";

export interface ShiftOverride {
  id: string; // `${karyawanId}_${mondayYMD}`
  karyawanId: string;
  mondayYMD: string; // Monday of the week YYYY-MM-DD
  shift: ShiftType;
  note?: string; // Reason / keterangan penyesuaian/tukar shift
  updatedAt?: string;
}

export interface ShiftSettings {
  pagiStartTime: string;
  pagiEndTime: string;
  siangStartTime: string;
  siangEndTime: string;
  reminderDay: number; // 0 = Sunday (Minggu)
  reminderTime: string; // "20:00"
  isAutoReminderEnabled: boolean;
  lastSentWeekKey?: string; // e.g. "2026-W36"
  reminderMessageTemplate?: string; // Custom WhatsApp message template
}

export interface Karyawan {
  id: string;
  nama: string;
  username: string;
  password: string;
  gajiPokok: number;
  uangMakan: number;
  createdAt: string;
  telepon?: string; // Nomor WhatsApp karyawan untuk reminder
  currentShift?: ShiftType; // "pagi" | "siang"
  shiftAnchorDate?: string; // YYYY-MM-DD (Senin acuan rolling)
  autoRollingShift?: boolean; // default true (rolling tiap Senin)
  kasbon?: number;
  bonus?: number;
  catatanGaji?: string;
}

export interface Absensi {
  id: string;
  karyawanId: string;
  nama: string;
  tanggal: string; // YYYY-MM-DD
  checkInTime: string; // ISO String
  checkOutTime?: string; // ISO String
  latitudeIn: number;
  longitudeIn: number;
  latitudeOut?: number;
  longitudeOut?: number;
  distanceIn?: number;
  distanceOut?: number;
  status: "Hadir" | "Terlambat";
}

export interface Izin {
  id: string;
  karyawanId: string;
  nama: string;
  tanggal: string; // YYYY-MM-DD (Tanggal Mulai)
  tanggalSelesai?: string; // YYYY-MM-DD (Tanggal Selesai)
  jumlahHari?: number; // Total hari libur
  alasan: string;
  status: "Pending" | "Disetujui" | "Ditolak";
  createdAt: string;
}

export interface Customer {
  id: string;
  nama: string;
  telepon: string; // WhatsApp phone
  alamat?: string;
  userId: string;
  createdAt: string;
  panggilan?: string;
  parfumFavorit?: string;
  lokasiAntarJemput?: string;
  latitude?: number;
  longitude?: number;
  saldoDeposit?: number; // deposit pre-paid balance
}

export interface Service {
  id: string;
  nama: string;
  tipe: string; // "Kiloan" | "Satuan" | "Meter" or customizable
  harga: number;
  durasiJam: number;
  userId: string;
  proses?: string[];
  durasiValue?: number;
  durasiTipe?: "Jam" | "Hari";
  minimalKuantitas?: number;
  kategori?: string;
  sematkan?: boolean;
  bahanBahan?: string[];
}

export interface LaundryTransaction {
  id: string; // Formatted e.g. TRX/260528/00001
  customerName: string;
  customerPhone: string;
  layananId: string;
  layananNama: string;
  parfum: string;
  berat: number; // weight or pcs qty
  totalHarga: number;
  status: "Antrian" | "Proses" | "Selesai" | "Diambil" | "Batal";
  statusBayar: "Lunas" | "Belum Lunas" | "DP";
  pembayaranMetode: "Tunai" | "QRIS" | "Transfer" | "Saldo Deposit";
  dpAmount?: number;
  tanggalMasuk: string; // YYYY-MM-DD HH:mm
  estimasiSelesai: string; // YYYY-MM-DD HH:mm
  tanggalSelesai?: string | null;
  tanggalDiambil?: string | null;
  notes?: string;
  userId: string;
}

export interface Parfum {
  id: string;
  nama: string;
  userId: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  title: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD format
  dueTime?: string; // HH:MM, optional
  isPaid: boolean;
  category: string;
  notes?: string;
  userId: string;
  createdAt: string;
  repeatMonthly?: boolean;
  repeatWeeklyThursday?: boolean;
  waNotificationSent?: boolean;
  lastNotificationSentDate?: string;
}

export interface PencairanBonus {
  id: string;
  karyawanId: string;
  karyawanNama: string;
  amount: number;
  date: string; // YYYY-MM-DD
  paymentMethod: string; // e.g. Tunai, Transfer, QRIS
  notes?: string;
  createdAt: string;
  linkedExpenseId?: string; // optional linked expense record ID
}

export interface KasbonHistory {
  id: string;
  karyawanId: string;
  karyawanNama: string;
  tipe: "penambahan" | "pengurangan";
  jumlah: number;
  tanggal: string; // YYYY-MM-DD
  keterangan: string;
  createdAt: string; // ISO String
}

export interface PotonganGaji {
  id: string;
  karyawanId: string;
  karyawanNama: string;
  jumlah: number;
  alasan: string;
  tanggal: string; // YYYY-MM-DD
  status: "aktif" | "dipotong";
  periodeGaji?: string;
  createdAt: string; // ISO String
}

export interface SystemVersionInfo {
  version: string;
  versionCode: number;
  publishedAt: string;
  title: string;
  description: string;
  changelog?: string[];
  forceReload?: boolean;
}


