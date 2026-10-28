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
}

export type ExpenseCategory = 
  | "Detergen & Sabun" 
  | "Listrik & Air" 
  | "Sewa & Utilitas" 
  | "Gaji Karyawan" 
  | "Pemeliharaan Mesin" 
  | "Pemasaran & Iklan" 
  | "Plastik"
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
}

export interface Karyawan {
  id: string;
  nama: string;
  username: string;
  password: string;
  gajiPokok: number;
  uangMakan: number;
  createdAt: string;
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
  tanggal: string; // YYYY-MM-DD
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
}

export interface Service {
  id: string;
  nama: string;
  tipe: "Kiloan" | "Satuan" | "Meter";
  harga: number;
  durasiJam: number;
  userId: string;
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
  statusBayar: "Lunas" | "Belum Lunas";
  pembayaranMetode: "Tunai" | "QRIS" | "Transfer";
  tanggalMasuk: string; // YYYY-MM-DD HH:mm
  estimasiSelesai: string; // YYYY-MM-DD HH:mm
  tanggalSelesai?: string | null;
  tanggalDiambil?: string | null;
  notes?: string;
  userId: string;
}
