import React, { useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import { 
  Users, 
  MapPin, 
  CalendarCheck, 
  Check, 
  X, 
  Plus, 
  Trash2, 
  Edit, 
  CircleDollarSign, 
  Calendar, 
  Download, 
  MapIcon, 
  RefreshCw, 
  Lock, 
  CheckCircle,
  Eye
} from "lucide-react";
import { Karyawan, Absensi, Izin, LocationConfig, Expense } from "../types";
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";

interface OwnerKaryawanPanelProps {
  ownerId: string;
  onAddExpense: (exp: Omit<Expense, "id">) => Promise<void>;
  triggerConfirm: (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    isDangerous?: boolean,
    confirmText?: string,
    cancelText?: string
  ) => void;
}

export function OwnerKaryawanPanel({
  ownerId,
  onAddExpense,
  triggerConfirm
}: OwnerKaryawanPanelProps) {
  const [panelTab, setPanelTab] = useState<"karyawan" | "absen" | "izin" | "gaji" | "lokasi">("karyawan");
  const [subTab, setSubTab] = useState<"staf" | "admin">("staf");

  // Database lists
  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [adminList, setAdminList] = useState<any[]>([]);
  const [absensiList, setAbsensiList] = useState<Absensi[]>([]);
  const [izinList, setIzinList] = useState<Izin[]>([]);
  
  // Dynamic user-edited state arrays mapped per Employee ID
  const [stafBonus, setStafBonus] = useState<{ [id: string]: number }>({});
  const [stafKasbon, setStafKasbon] = useState<{ [id: string]: number }>({});
  const [stafCatatan, setStafCatatan] = useState<{ [id: string]: string }>({});

  const [locationConfig, setLocationConfig] = useState<LocationConfig>({
    latitude: -6.2088,
    longitude: 106.8456,
    radius: 100,
    namaLokasi: "Outlet Damdam Laundry"
  });

  const getWeeklyPeriodDates = (refDate = new Date()) => {
    const d = new Date(refDate);
    const day = d.getDay(); 
    // Find days to upcoming Thursday. 
    // Sunday (0) -> 4 days, Monday (1) -> 3 days, Tuesday (2) -> 2 days, Wednesday (3) -> 1 day
    // Thursday (4) -> 0 days, Friday (5) -> 6 days, Saturday (6) -> 5 days
    const daysUntilThursday = (4 - day + 7) % 7;
    
    const thursday = new Date(d);
    thursday.setDate(d.getDate() + daysUntilThursday);
    
    const friday = new Date(thursday);
    friday.setDate(thursday.getDate() - 6);
    
    const startStr = friday.toISOString().substring(0, 10);
    const endStr = thursday.toISOString().substring(0, 10);
    
    const formatted = `${friday.toLocaleDateString("id-ID", { day: "numeric", month: "long" })} - ${thursday.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;
    return { startStr, endStr, formatted, friday, thursday };
  };

  const getCurrentGajiPeriod = () => {
    if (gajiStartDate && gajiEndDate) {
      const formatted = `${new Date(gajiStartDate).toLocaleDateString("id-ID", { day: "numeric", month: "long" })} - ${new Date(gajiEndDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;
      return {
        startStr: gajiStartDate,
        endStr: gajiEndDate,
        formatted
      };
    }
    return getWeeklyPeriodDates();
  };

  // Loading/saving feedback states
  const [loading, setLoading] = useState<boolean>(true);
  const [savingLocation, setSavingLocation] = useState<boolean>(false);

  // Karyawan form state
  const [isEditingKaryawan, setIsEditingKaryawan] = useState<boolean>(false);
  const [editKaryawanId, setEditKaryawanId] = useState<string | null>(null);
  const [karyawanNama, setKaryawanNama] = useState<string>("");
  const [karyawanUser, setKaryawanUser] = useState<string>("");
  const [karyawanPass, setKaryawanPass] = useState<string>("");
  const [karyawanGaji, setKaryawanGaji] = useState<number>(1500000);
  const [karyawanMakan, setKaryawanMakan] = useState<number>(20000);

  // Admin form state
  const [isEditingAdmin, setIsEditingAdmin] = useState<boolean>(false);
  const [editAdminId, setEditAdminId] = useState<string | null>(null);
  const [adminNama, setAdminNama] = useState<string>("");
  const [adminUser, setAdminUser] = useState<string>("");
  const [adminPass, setAdminPass] = useState<string>("");

  // Filter state
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>("Semua");
  const [absensiStartDate, setAbsensiStartDate] = useState<string>("");
  const [absensiEndDate, setAbsensiEndDate] = useState<string>("");
  const [izinStartDate, setIzinStartDate] = useState<string>("");
  const [izinEndDate, setIzinEndDate] = useState<string>("");
  const [gajiStartDate, setGajiStartDate] = useState<string>("");
  const [gajiEndDate, setGajiEndDate] = useState<string>("");

  // 1. Fetch Location Configuration
  useEffect(() => {
    const locRef = doc(db, "users", ownerId, "settings", "location");
    const unsub = onSnapshot(locRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as LocationConfig;
        setLocationConfig(data);
      }
    });
    return unsub;
  }, [ownerId]);

  // 2. Load Employees, Attendance, and Leave real-time
  useEffect(() => {
    const karRef = collection(db, "users", ownerId, "karyawan");
    const unsubKar = onSnapshot(karRef, (snap) => {
      const all: Karyawan[] = [];
      snap.forEach((d) => {
        all.push(d.data() as Karyawan);
      });
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setKaryawanList(all);
      setLoading(false);
    });

    const admRef = collection(db, "users", ownerId, "admins");
    const unsubAdm = onSnapshot(admRef, (snap) => {
      const all: any[] = [];
      snap.forEach((d) => {
        all.push(d.data());
      });
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setAdminList(all);
    });

    const absRef = collection(db, "users", ownerId, "absensi");
    const unsubAbs = onSnapshot(absRef, (snap) => {
      const all: Absensi[] = [];
      snap.forEach((d) => {
        all.push(d.data() as Absensi);
      });
      all.sort((a, b) => b.checkInTime.localeCompare(a.checkInTime));
      setAbsensiList(all);
    });

    const izRef = collection(db, "users", ownerId, "izin");
    const unsubIz = onSnapshot(izRef, (snap) => {
      const all: Izin[] = [];
      snap.forEach((d) => {
        all.push(d.data() as Izin);
      });
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setIzinList(all);
    });

    return () => {
      unsubKar();
      unsubAdm();
      unsubAbs();
      unsubIz();
    };
  }, [ownerId]);

  // Helper formats
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(val);
  };

  // Add or Edit Employee account
  const handleSaveKaryawan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!karyawanNama.trim() || !karyawanUser.trim() || !karyawanPass.trim()) {
      alert("Harap lengkapi seluruh kolom formulir karyawan.");
      return;
    }

    const cleanUser = karyawanUser.trim().toLowerCase();
    
    // Check conflicts
    const conflict = karyawanList.find((k) => k.username === cleanUser && k.id !== editKaryawanId);
    if (conflict) {
      alert("Username karyawan sudah digunakan oleh staf lain. Silakan pilih username lain.");
      return;
    }

    const targetId = isEditingKaryawan && editKaryawanId ? editKaryawanId : `kar-${Date.now()}`;
    const targetPayload: Karyawan = {
      id: targetId,
      nama: karyawanNama.trim(),
      username: cleanUser,
      password: karyawanPass.trim(),
      gajiPokok: karyawanGaji,
      uangMakan: karyawanMakan,
      createdAt: isEditingKaryawan ? (karyawanList.find((k) => k.id === targetId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "users", ownerId, "karyawan", targetId), targetPayload);
      
      // Clear forms
      setKaryawanNama("");
      setKaryawanUser("");
      setKaryawanPass("");
      setKaryawanGaji(1500000);
      setKaryawanMakan(20000);
      setIsEditingKaryawan(false);
      setEditKaryawanId(null);
    } catch (err) {
      console.error("Gagal menyimpan karyawan:", err);
      alert("Gagal menyimpan data karyawan ke database.");
    }
  };

  const handleEditClick = (k: Karyawan) => {
    setIsEditingKaryawan(true);
    setEditKaryawanId(k.id);
    setKaryawanNama(k.nama);
    setKaryawanUser(k.username);
    setKaryawanPass(k.password);
    setKaryawanGaji(k.gajiPokok);
    setKaryawanMakan(k.uangMakan);
  };

  const handleDeleteKaryawan = (id: string, nama: string) => {
    triggerConfirm(
      "HAPUS STAF KARYAWAN",
      `Apakah Anda yakin ingin menghapus akun dan profil karyawan bernama ${nama}? Tindakan ini tidak dapat dibatalkan.`,
      async () => {
        try {
          await deleteDoc(doc(db, "users", ownerId, "karyawan", id));
        } catch (err) {
          console.error(err);
          alert("Gagal menghapus akun karyawan.");
        }
      },
      true,
      "YA, HAPUS AKUN",
      "BATAL"
    );
  };

  // Admin account CRUD operations
  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNama.trim() || !adminUser.trim() || !adminPass.trim()) {
      alert("Harap lengkapi seluruh kolom formulir admin.");
      return;
    }

    const cleanUser = adminUser.trim().toLowerCase();
    
    // Check conflicts
    const conflict = adminList.find((a) => a.username === cleanUser && a.id !== editAdminId);
    if (conflict) {
      alert("Username admin sudah digunakan oleh pengelola lain. Silakan pilih username lain.");
      return;
    }

    const targetId = isEditingAdmin && editAdminId ? editAdminId : `adm-${Date.now()}`;
    const targetPayload = {
      id: targetId,
      nama: adminNama.trim(),
      username: cleanUser,
      password: adminPass.trim(),
      createdAt: isEditingAdmin ? (adminList.find((a) => a.id === targetId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "users", ownerId, "admins", targetId), targetPayload);
      
      // Clear forms
      setAdminNama("");
      setAdminUser("");
      setAdminPass("");
      setIsEditingAdmin(false);
      setEditAdminId(null);
    } catch (err) {
      console.error("Gagal menyimpan admin:", err);
      alert("Gagal menyimpan data admin ke database.");
    }
  };

  const handleEditAdminClick = (a: any) => {
    setIsEditingAdmin(true);
    setEditAdminId(a.id);
    setAdminNama(a.nama);
    setAdminUser(a.username);
    setAdminPass(a.password);
  };

  const handleDeleteAdmin = (id: string, nama: string) => {
    triggerConfirm(
      "HAPUS AKUN ADMIN",
      `Apakah Anda yakin ingin menghapus akun admin bernama ${nama}? Tindakan ini tidak dapat dibatalkan.`,
      async () => {
        try {
          await deleteDoc(doc(db, "users", ownerId, "admins", id));
        } catch (err) {
          console.error(err);
          alert("Gagal menghapus akun admin.");
        }
      },
      true,
      "YA, HAPUS AKUN",
      "BATAL"
    );
  };

  // Moderate Leave approvals
  const handleModerateLeave = async (id: string, accept: boolean) => {
    const statusLabel = accept ? "Disetujui" : "Ditolak";
    const targetIzin = izinList.find((iz) => iz.id === id);
    if (!targetIzin) return;

    try {
      await setDoc(doc(db, "users", ownerId, "izin", id), {
        ...targetIzin,
        status: statusLabel
      });
    } catch (err) {
      console.error(err);
      alert("Gagal memperbarui status izin.");
    }
  };

  // Set Outlet center location coordinates
  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLocation(true);
    try {
      await setDoc(doc(db, "users", ownerId, "settings", "location"), locationConfig);
      alert("Konfigurasi titik koordinat outlet berhasil diperbarui!");
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan koordinat lokasi: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingLocation(false);
    }
  };

  const handleGetCurrentCoords = () => {
    if (!navigator.geolocation) {
      alert("Browser Anda tidak mendukung Geolocation.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationConfig((prev) => ({
          ...prev,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        }));
      },
      (err) => {
        alert("Gagal mengambil GPS saat ini: " + err.message);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleUpdateGajiParams = async (stafId: string, bonus: number, kasbon: number, catatan: string) => {
    try {
      const stafRef = doc(db, "users", ownerId, "karyawan", stafId);
      const target = karyawanList.find(c => c.id === stafId);
      if (!target) return;
      await setDoc(stafRef, {
        ...target,
        bonus,
        kasbon,
        catatanGaji: catatan
      });
      alert(`Berhasil memperbarui parameter gaji staf ${target.nama}`);
    } catch (err) {
      console.error(err);
      alert("Gagal memperbarui parameter gaji.");
    }
  };

  // Payout process: records salaries as system expenses under "Gaji Karyawan"
  const handleProcessPayroll = (k: Karyawan, workDays: number, totalFood: number) => {
    const finalBonus = k.bonus || 0;
    const finalKasbon = k.kasbon || 0;
    const weeklyBase = k.gajiPokok / 4;
    const totalGaji = weeklyBase + totalFood + finalBonus - finalKasbon;
    
    const dateYMD = new Date().toISOString().substring(0, 10);
    const weeklyPeriod = getCurrentGajiPeriod();
    
    triggerConfirm(
      "PROSES & SINKRON GAJI MINGGUAN",
      `Bayar gaji ${k.nama} periode ${weeklyPeriod.formatted} sebesar ${formatIDR(totalGaji)} (Pokok Mingguan: ${formatIDR(weeklyBase)}, Makan: ${formatIDR(totalFood)}, Bonus: ${formatIDR(finalBonus)}, Kasbon: -${formatIDR(finalKasbon)}, Kehadiran: ${workDays} hari) dan rekam otomatis sebagai pencatatan pengeluaran laundry?`,
      async () => {
        try {
          await onAddExpense({
            title: `Gaji Mingguan Staf: ${k.nama} (${weeklyPeriod.formatted})`,
            amount: totalGaji,
            category: "Gaji Karyawan",
            date: dateYMD,
            paymentMethod: "Transfer",
            notes: `Ondemand payroll mingguan otomatis. Pokok Mingguan (1/4): ${formatIDR(weeklyBase)}, Makan: ${formatIDR(totalFood)} (${workDays} hari), Bonus: ${formatIDR(finalBonus)}, Kasbon: -${formatIDR(finalKasbon)}. Catatan: ${k.catatanGaji || "-"}`
          });
          alert(`Berhasil memproses gaji mingguan ${k.nama} dan merekam pengeluaran sebesar ${formatIDR(totalGaji)}!`);
        } catch (err) {
          console.error(err);
          alert("Gagal mencatat transaksi gaji ke pengeluaran-.");
        }
      }
    );
  };

  const downloadSlipGajiForStaf = (staf: Karyawan) => {
    const weeklyPeriod = getCurrentGajiPeriod();
    const currentMonth = new Date().toISOString().substring(0, 7); // "YYYY-MM"
    
    // Weekly attendance records (Friday - Thursday)
    const currentWeekAbsensi = absensiList.filter(
      (a) => a.karyawanId === staf.id && a.tanggal >= weeklyPeriod.startStr && a.tanggal <= weeklyPeriod.endStr
    );
    
    // Sisa Kuota Libur (limit is 3 per month)
    const approvedLeavesThisMonth = izinList.filter(
      (iz) => iz.karyawanId === staf.id && iz.status === "Disetujui" && iz.tanggal.startsWith(currentMonth)
    ).length;
    const remainingLeaveQuota = Math.max(0, 3 - approvedLeavesThisMonth);

    const workDaysCount = currentWeekAbsensi.length; // How many times checked in this week period
    const weeklyBaseSalary = staf.gajiPokok / 4;
    const totalFoodAllowance = workDaysCount * staf.uangMakan;
    const bonus = staf.bonus || 0;
    const kasbon = staf.kasbon || 0;
    const totalPayout = weeklyBaseSalary + totalFoodAllowance + bonus - kasbon;

    const docPdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    // 1. Accent Green Top Strip
    docPdf.setFillColor(16, 185, 129); // Emerald-500
    docPdf.rect(15, 15, 180, 3, "F");

    // 2. Company Info (Damdam Laundry)
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(22);
    docPdf.setTextColor(24, 24, 27); // zinc-900
    docPdf.text("DAMDAM LAUNDRY", 15, 30);

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9.5);
    docPdf.setTextColor(113, 113, 122); // zinc-500
    docPdf.text("Pencatatan Keuangan & Portal Karyawan Digital", 15, 35);

    // 3. Document Title on Right
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(14);
    docPdf.setTextColor(16, 185, 129); // Emerald green
    docPdf.text("SLIP GAJI KARYAWAN", 195, 30, { align: "right" });

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(8.5);
    docPdf.setTextColor(39, 39, 42); // zinc-800
    docPdf.text(`PERIODE: ${weeklyPeriod.formatted.toUpperCase()}`, 195, 35, { align: "right" });

    // Header Separator Line
    docPdf.setDrawColor(228, 228, 231); // zinc-200
    docPdf.setLineWidth(0.4);
    docPdf.line(15, 41, 195, 41);

    // 4. Metadata details Left Column (Karyawan Info)
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9.5);
    docPdf.setTextColor(113, 113, 122); // zinc-500
    docPdf.text("INFORMASI KARYAWAN", 15, 49);

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9);
    docPdf.setTextColor(63, 63, 70); // zinc-700
    docPdf.text("Nama Karyawan", 15, 56);
    docPdf.text("ID Karyawan", 15, 62);
    docPdf.text("Jabatan / Posisi", 15, 68);

    docPdf.setFont("helvetica", "bold");
    docPdf.setTextColor(24, 24, 27); // zinc-900
    docPdf.text(`:  ${staf.nama}`, 45, 56);
    docPdf.text(`:  ${staf.id}`, 45, 62);
    docPdf.text(`:  Karyawan Operasional`, 45, 68);

    // Metadata details Right Column (Outlet & Data Info)
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9.5);
    docPdf.setTextColor(113, 113, 122); // zinc-500
    docPdf.text("INFORMASI OUTLET & CETAK", 115, 49);

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9);
    docPdf.setTextColor(63, 63, 70); // zinc-700
    docPdf.text("Lokasi Tugas", 115, 56);
    docPdf.text("Tanggal Cetak", 115, 62);
    docPdf.text("Status Dokumen", 115, 68);

    docPdf.setFont("helvetica", "bold");
    docPdf.setTextColor(24, 24, 27); // zinc-900
    docPdf.text(`:  ${locationConfig.namaLokasi}`, 142, 56);
    docPdf.text(`:  ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}`, 142, 62);
    docPdf.setTextColor(16, 124, 65); // Emerald-700
    docPdf.text(`:  DISETUJUI & SAH`, 142, 68);

    // 5. Income Details Table Header
    const startTableY = 80;
    docPdf.setFillColor(244, 244, 245); // zinc-100
    docPdf.rect(15, startTableY, 180, 8, "F");

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9);
    docPdf.setTextColor(82, 82, 91); // zinc-600
    docPdf.text("DESKRIPSI PENERIMAAN PENDAPATAN", 18, startTableY + 5.5);
    docPdf.text("KOMPONEN / PERHITUNGAN", 110, startTableY + 5.5);
    docPdf.text("JUMLAH (IDR)", 192, startTableY + 5.5, { align: "right" });

    // Table Header border bottom
    docPdf.setDrawColor(212, 212, 216); // zinc-300
    docPdf.line(15, startTableY + 8, 195, startTableY + 8);

    // Row 1: Gaji Pokok Mingguan
    let nextY = startTableY + 15;
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9);
    docPdf.setTextColor(24, 24, 27);
    docPdf.text("1. Gaji Pokok Mingguan", 18, nextY);
    docPdf.setTextColor(113, 113, 122);
    docPdf.text("Bagian mingguan (1/4 gaji pokok bulanan)", 110, nextY);
    docPdf.setTextColor(24, 24, 27);
    docPdf.setFont("helvetica", "bold");
    docPdf.text(formatIDR(weeklyBaseSalary), 192, nextY, { align: "right" });

    // Simple zebra line
    docPdf.setDrawColor(244, 244, 245); // zinc-100
    docPdf.line(15, nextY + 4, 195, nextY + 4);

    // Row 2: Uang Makan Kehadiran
    nextY = nextY + 10;
    docPdf.setFont("helvetica", "normal");
    docPdf.setTextColor(24, 24, 27);
    docPdf.text("2. Uang Makan & Insentif Kerja", 18, nextY);
    docPdf.setTextColor(113, 113, 122);
    docPdf.text(`${workDaysCount} hari hadir (@ ${formatIDR(staf.uangMakan)})`, 110, nextY);
    docPdf.setTextColor(24, 24, 27);
    docPdf.setFont("helvetica", "bold");
    docPdf.text(formatIDR(totalFoodAllowance), 192, nextY, { align: "right" });

    // Simple zebra line
    docPdf.setDrawColor(244, 244, 245); // zinc-100
    docPdf.line(15, nextY + 4, 195, nextY + 4);

    // Row 3: Bonus Tambahan
    nextY = nextY + 10;
    docPdf.setFont("helvetica", "normal");
    docPdf.setTextColor(24, 24, 27);
    docPdf.text("3. Bonus Tambahan Instan", 18, nextY);
    docPdf.setTextColor(113, 113, 122);
    docPdf.text("Bonus performa / lembur dari Owner", 110, nextY);
    docPdf.setTextColor(16, 124, 65); // emerald-700 for plus
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`+ ${formatIDR(bonus)}`, 192, nextY, { align: "right" });

    // Simple zebra line
    docPdf.setDrawColor(244, 244, 245); // zinc-100
    docPdf.line(15, nextY + 4, 195, nextY + 4);

    // Row 4: Potongan Kasbon
    nextY = nextY + 10;
    docPdf.setFont("helvetica", "normal");
    docPdf.setTextColor(24, 24, 27);
    docPdf.text("4. Potongan Kasbon Pegawai", 18, nextY);
    docPdf.setTextColor(113, 113, 122);
    docPdf.text("Pemotongan/angsuran kasbon karyawan", 110, nextY);
    docPdf.setTextColor(185, 28, 28); // red-700 for minus
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`- ${formatIDR(kasbon)}`, 192, nextY, { align: "right" });

    // Simple zebra line
    docPdf.setDrawColor(244, 244, 245); // zinc-100
    docPdf.line(15, nextY + 4, 195, nextY + 4);

    // Row 5: Leave tracking
    nextY = nextY + 10;
    docPdf.setFont("helvetica", "normal");
    docPdf.setTextColor(24, 24, 27);
    docPdf.text("5. Log Libur & Izin Bulan Ini", 18, nextY);
    docPdf.setTextColor(113, 113, 122);
    docPdf.text(`Diambil: ${approvedLeavesThisMonth} hari (Sisa: ${remainingLeaveQuota} hari)`, 110, nextY);
    docPdf.setTextColor(113, 113, 122);
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Potong Makan", 192, nextY, { align: "right" });

    // End Table border bottom
    docPdf.setDrawColor(212, 212, 216); // zinc-300
    docPdf.line(15, nextY + 5, 195, nextY + 5);

    // 6. Grand Total Net Payout Block
    nextY = nextY + 12;
    docPdf.setFillColor(236, 253, 245); // emerald-50
    docPdf.rect(15, nextY, 180, 12, "F");

    docPdf.setDrawColor(16, 185, 129); // emerald-500
    docPdf.setLineWidth(0.4);
    docPdf.rect(15, nextY, 180, 12, "S");

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(10.5);
    docPdf.setTextColor(6, 95, 70); // emerald-800
    docPdf.text("TOTAL TAKE HOME PAY (NET)", 20, nextY + 7.5);
    docPdf.setFontSize(12);
    docPdf.text(formatIDR(totalPayout), 192, nextY + 7.5, { align: "right" });

    // Owner Notes section inside PDF
    if (staf.catatanGaji && staf.catatanGaji.trim()) {
      nextY = nextY + 17;
      docPdf.setFillColor(250, 250, 250); // slight gray bg
      docPdf.rect(15, nextY, 180, 14, "F");
      docPdf.setDrawColor(228, 228, 231);
      docPdf.setLineWidth(0.2);
      docPdf.rect(15, nextY, 180, 14, "S");

      docPdf.setFont("helvetica", "bold");
      docPdf.setFontSize(8);
      docPdf.setTextColor(39, 39, 42); // zinc-800
      docPdf.text("CATATAN TAMBAHAN OWNER:", 18, nextY + 4.5);
      
      docPdf.setFont("helvetica", "italic");
      docPdf.setFontSize(8);
      docPdf.setTextColor(113, 113, 122);
      docPdf.text(staf.catatanGaji.substring(0, 95), 18, nextY + 9.5);
    }

    // 7. System Footnotes
    nextY = nextY + 20;
    docPdf.setFont("helvetica", "italic");
    docPdf.setFontSize(8);
    docPdf.setTextColor(113, 113, 122); // zinc-500
    docPdf.text("Catatan: Komponen uang makan dihitung terintegrasi melalui perekaman absensi digital", 15, nextY);
    docPdf.text("pada saat berstatus masuk (terverifikasi berada di cakupan area GPS outlet secara sah).", 15, nextY + 4);

    // 8. Signatures Section
    nextY = nextY + 18;
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9.5);
    docPdf.setTextColor(63, 63, 70); // zinc-700
    docPdf.text("Penerima Gaji (Karyawan),", 25, nextY);
    docPdf.text("Mengetahui / Manajemen Owner,", 145, nextY);

    nextY = nextY + 18;
    docPdf.setFont("helvetica", "bold");
    docPdf.setTextColor(24, 24, 27); // zinc-900
    docPdf.text(staf.nama, 25, nextY);
    docPdf.text("Damdam Laundry Management", 145, nextY);

    // Underline for signature names
    docPdf.setDrawColor(161, 161, 170); // zinc-400
    docPdf.setLineWidth(0.2);
    docPdf.line(25, nextY + 1.5, 65, nextY + 1.5);
    docPdf.line(145, nextY + 1.5, 195, nextY + 1.5);

    // 9. Download the PDF File
    docPdf.save(`Slip_Gaji_${staf.nama.replace(/\s+/g, "_")}_${currentMonth}.pdf`);
  };

  // Export Attendance history logs to CSV spreadsheet format (respects active employee & date filters)
  const handleExportAbsensiCSV = () => {
    if (filteredAbsensi.length === 0) {
      alert("Tidak ada data absensi terpilih/terfilter untuk diekspor!");
      return;
    }

    let csvContent = "\uFEFFTanggal,Nama Karyawan,ID Karyawan,Jam Masuk,Jam Pulang,Status Kehadiran,Jarak In (m)\n";
    filteredAbsensi.forEach((a) => {
      const checkInHour = new Date(a.checkInTime).toLocaleTimeString("id-ID", { timeStyle: "medium" });
      const checkOutHour = a.checkOutTime 
        ? new Date(a.checkOutTime).toLocaleTimeString("id-ID", { timeStyle: "medium" })
        : "Belum Keluar";
      const row = [
        a.tanggal,
        `"${a.nama.replace(/"/g, '""')}"`,
        a.karyawanId,
        checkInHour,
        checkOutHour,
        a.status,
        a.distanceIn || "0"
      ].join(",");
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Log_Absensi_Filter_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter lists based on employee selection and date period filters
  const filteredAbsensi = absensiList.filter((a) => {
    if (selectedStaffFilter !== "Semua" && a.karyawanId !== selectedStaffFilter) return false;
    if (absensiStartDate && a.tanggal < absensiStartDate) return false;
    if (absensiEndDate && a.tanggal > absensiEndDate) return false;
    return true;
  });

  const filteredIzin = izinList.filter((iz) => {
    if (selectedStaffFilter !== "Semua" && iz.karyawanId !== selectedStaffFilter) return false;
    if (izinStartDate && iz.tanggal < izinStartDate) return false;
    if (izinEndDate && iz.tanggal > izinEndDate) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans">
      
      {/* Tab bar header */}
      <div className="grid grid-cols-5 gap-0.5 bg-[#121214] p-1 border-b border-[#27272A] shrink-0 text-center text-[10px] uppercase font-black tracking-tighter">
        <button
          onClick={() => setPanelTab("karyawan")}
          className={`py-2 px-1 cursor-pointer transition-all ${
            panelTab === "karyawan" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          Staf CRUD
        </button>
        <button
          onClick={() => setPanelTab("absen")}
          className={`py-2 px-1 cursor-pointer transition-all ${
            panelTab === "absen" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          Absensi
        </button>
        <button
          onClick={() => setPanelTab("izin")}
          className={`py-2 px-1 cursor-pointer transition-all ${
            panelTab === "izin" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          Izin Libur
        </button>
        <button
          onClick={() => setPanelTab("gaji")}
          className={`py-2 px-1 cursor-pointer transition-all ${
            panelTab === "gaji" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          Gaji Staf
        </button>
        <button
          onClick={() => setPanelTab("lokasi")}
          className={`py-2 px-1 cursor-pointer transition-all ${
            panelTab === "lokasi" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          GPS Outlet
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-2">
          <span className="w-6 h-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-[10px] uppercase font-mono text-zinc-550 font-bold tracking-widest">
            Memuat Data Pegawai...
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          
           {/* TAB 1: KARYAWAN (CRUD REGISTER) */}
          {panelTab === "karyawan" && (
            <div className="space-y-4">
              
              {/* Segmented control for Staf vs Admin credentials */}
              <div className="grid grid-cols-2 gap-1 bg-[#121214] p-1 border border-[#27272A] shrink-0 font-extrabold uppercase text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setSubTab("staf")}
                  className={`py-2 px-1 transition-all cursor-pointer ${
                    subTab === "staf" ? "bg-emerald-500 text-black font-black" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Staf (Karyawan)
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab("admin")}
                  className={`py-2 px-1 transition-all cursor-pointer ${
                    subTab === "admin" ? "bg-emerald-500 text-black font-black" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Admin (Pengelola)
                </button>
              </div>

              {subTab === "staf" ? (
                <>
                  {/* Form Input / Edit Karyawan */}
                  <form onSubmit={handleSaveKaryawan} className="bg-[#121214] border border-[#27272A] p-4 space-y-3 text-left">
                    <h4 className="text-[10.5px] font-black text-emerald-500 uppercase tracking-wider border-b border-[#27272A] pb-2">
                      {isEditingKaryawan ? "MODIFIKASI DETAIL STAF/KARYAWAN" : "REGISTER AKUN KARYAWAN BARU"}
                    </h4>
                    
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Nama Lengkap Karyawan</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: Santi Susanti, Budi Setiawan"
                          value={karyawanNama}
                          onChange={(e) => setKaryawanNama(e.target.value)}
                          className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Username Login</label>
                          <input
                            type="text"
                            required
                            placeholder="santi"
                            value={karyawanUser}
                            onChange={(e) => setKaryawanUser(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Password Login</label>
                          <input
                            type="text"
                            required
                            placeholder="santi123"
                            value={karyawanPass}
                            onChange={(e) => setKaryawanPass(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Gaji Pokok Utama (Rp)</label>
                          <input
                            type="number"
                            required
                            value={karyawanGaji}
                            onChange={(e) => setKaryawanGaji(Number(e.target.value))}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Uang Makan / Hari (Rp)</label>
                          <input
                            type="number"
                            required
                            value={karyawanMakan}
                            onChange={(e) => setKaryawanMakan(Number(e.target.value))}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-none transition-all cursor-pointer"
                      >
                        {isEditingKaryawan ? "SIMPAN PERUBAHAN PROFILE" : "REGISTER SEKARANG"}
                      </button>
                      {isEditingKaryawan && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingKaryawan(false);
                            setEditKaryawanId(null);
                            setKaryawanNama("");
                            setKaryawanUser("");
                            setKaryawanPass("");
                            setKaryawanGaji(1500000);
                            setKaryawanMakan(20000);
                          }}
                          className="px-3 py-2.5 bg-zinc-950 border border-zinc-900 text-zinc-400 font-extrabold text-xs uppercase"
                        >
                          Batal
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Laundry ID Info Card block */}
                  <div className="bg-[#121214] border border-emerald-900/30 p-3 flex flex-col gap-2 relative overflow-hidden text-left">
                    <span className="text-[8.5px] font-mono leading-none text-emerald-400 bg-emerald-950 px-2 py-0.5 w-max font-black tracking-widest uppercase">
                      🔐 ID KODE OUTLET (LAUNDRY ID)
                    </span>
                    <p className="text-[10px] text-zinc-400 font-bold leading-normal mt-1">
                      Bagikan ID berikut kepada staf Anda untuk login di HP/PWA mereka:
                    </p>
                    <div className="bg-zinc-950 p-2 border border-zinc-900 font-mono text-xs font-black select-all text-white text-center tracking-wider max-w-sm">
                      {ownerId}
                    </div>
                  </div>

                  {/* Daftar Karyawan List */}
                  <div className="bg-[#121214] border border-[#27272A] p-4 text-left">
                    <h4 className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3">
                      STAF LAUNDRY TERDAFTAR ({karyawanList.length})
                    </h4>

                    <div className="space-y-2">
                      {karyawanList.length === 0 ? (
                        <p className="text-[10px] text-zinc-500 text-center italic py-4">Belum ada staf karyawan yang didaftarkan.</p>
                      ) : (
                        karyawanList.map((k) => (
                          <div key={k.id} className="bg-[#0A0A0B] border border-zinc-950 p-3.5 flex items-center justify-between">
                            <div className="space-y-1">
                              <h5 className="font-extrabold text-xs text-white uppercase tracking-tight">{k.nama}</h5>
                              <div className="text-[10px] text-zinc-500 font-mono space-y-0.5">
                                <p>Username: <strong className="text-zinc-300 font-semibold">{k.username}</strong> | Pass: <strong className="text-zinc-300 font-semibold">{k.password}</strong></p>
                                <p>Pokok: <span className="text-emerald-500">{formatIDR(k.gajiPokok)}</span> | Makan/Hari: <span className="text-emerald-500">{formatIDR(k.uangMakan)}</span></p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleEditClick(k)}
                                className="bg-zinc-950 border border-[#27272A] hover:border-emerald-500 text-zinc-400 hover:text-emerald-400 p-1.5 transition-all cursor-pointer rounded-mono"
                                title="Edit"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteKaryawan(k.id, k.nama)}
                                className="bg-zinc-950 border border-[#27272A] hover:border-red-900 text-zinc-400 hover:text-red-400 p-1.5 transition-all cursor-pointer rounded-mono"
                                title="Hapus"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Form Input / Edit Admin */}
                  <form onSubmit={handleSaveAdmin} className="bg-[#121214] border border-[#27272A] p-4 space-y-3 text-left">
                    <h4 className="text-[10.5px] font-black text-emerald-500 uppercase tracking-wider border-b border-[#27272A] pb-2">
                      {isEditingAdmin ? "MODIFIKASI DETAIL ADMIN" : "REGISTER AKUN ADMIN BARU"}
                    </h4>
                    
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Nama Lengkap Admin</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: Rian Anggara"
                          value={adminNama}
                          onChange={(e) => setAdminNama(e.target.value)}
                          className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Username Login</label>
                          <input
                            type="text"
                            required
                            placeholder="rian_admin"
                            value={adminUser}
                            onChange={(e) => setAdminUser(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Password Login</label>
                          <input
                            type="text"
                            required
                            placeholder="rian123"
                            value={adminPass}
                            onChange={(e) => setAdminPass(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-none transition-all cursor-pointer"
                      >
                        {isEditingAdmin ? "SIMPAN PERUBAHAN PROFILE" : "REGISTER ADMIN"}
                      </button>
                      {isEditingAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingAdmin(false);
                            setEditAdminId(null);
                            setAdminNama("");
                            setAdminUser("");
                            setAdminPass("");
                          }}
                          className="px-3 py-2.5 bg-zinc-950 border border-zinc-900 text-zinc-400 font-extrabold text-xs uppercase"
                        >
                          Batal
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Laundry ID Info Card block */}
                  <div className="bg-[#121214] border border-emerald-900/30 p-3 flex flex-col gap-2 relative overflow-hidden text-left">
                    <span className="text-[8.5px] font-mono leading-none text-emerald-400 bg-emerald-950 px-2 py-0.5 w-max font-black tracking-widest uppercase">
                      🔐 ID KODE OUTLET (LAUNDRY ID)
                    </span>
                    <p className="text-[10px] text-zinc-400 font-bold leading-normal mt-1">
                      Bagikan ID berikut kepada pengelola admin untuk login di perangkat mereka:
                    </p>
                    <div className="bg-zinc-950 p-2 border border-zinc-900 font-mono text-xs font-black select-all text-white text-center tracking-wider max-w-sm">
                      {ownerId}
                    </div>
                  </div>

                  {/* Daftar Admin List */}
                  <div className="bg-[#121214] border border-[#27272A] p-4 text-left">
                    <h4 className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3">
                      ADMIN LAUNDRY TERDAFTAR ({adminList.length})
                    </h4>

                    <div className="space-y-2">
                      {adminList.length === 0 ? (
                        <p className="text-[10px] text-zinc-500 text-center italic py-4">Belum ada akun admin pengelola yang didaftarkan.</p>
                      ) : (
                        adminList.map((a) => (
                          <div key={a.id} className="bg-[#0A0A0B] border border-zinc-950 p-3.5 flex items-center justify-between">
                            <div className="space-y-1">
                              <h5 className="font-extrabold text-xs text-white uppercase tracking-tight">{a.nama}</h5>
                              <div className="text-[10px] text-zinc-500 font-mono space-y-0.5">
                                <p>Username: <strong className="text-zinc-300 font-semibold">{a.username}</strong> | Pass: <strong className="text-zinc-300 font-semibold">{a.password}</strong></p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleEditAdminClick(a)}
                                className="bg-zinc-950 border border-[#27272A] hover:border-emerald-500 text-zinc-400 hover:text-emerald-400 p-1.5 transition-all cursor-pointer rounded-mono"
                                title="Edit"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteAdmin(a.id, a.nama)}
                                className="bg-zinc-950 border border-[#27272A] hover:border-red-900 text-zinc-400 hover:text-red-400 p-1.5 transition-all cursor-pointer rounded-mono"
                                title="Hapus"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: ABSENSI LOGS MANAGER */}
          {panelTab === "absen" && (
            <div className="space-y-4 text-left">
              
              {/* Filter and export actions */}
              <div className="bg-[#121214] border border-[#27272A] p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider flex items-center gap-1 font-sans">
                    <Users className="text-emerald-500 w-4 h-4" /> Filter Log & Ekspor
                  </span>
                  
                  <button
                    onClick={handleExportAbsensiCSV}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black font-sans text-[10px] uppercase cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Pilih Karyawan</label>
                    <select
                      value={selectedStaffFilter}
                      onChange={(e) => setSelectedStaffFilter(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 text-xs rounded-none font-bold"
                    >
                      <option value="Semua">Semua Karyawan</option>
                      {karyawanList.map((st) => (
                        <option key={st.id} value={st.id}>{st.nama}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Mulai Tanggal</label>
                    <input
                      type="date"
                      value={absensiStartDate}
                      onChange={(e) => setAbsensiStartDate(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-xs rounded-none font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Sampai Tanggal</label>
                    <input
                      type="date"
                      value={absensiEndDate}
                      onChange={(e) => setAbsensiEndDate(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-xs rounded-none font-bold font-mono"
                    />
                  </div>
                </div>

                {/* Pintasan Periode Cepat */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#27272A]/50">
                  <span className="text-[8.5px] font-black text-[#A1A1AA] uppercase tracking-wider self-center mr-1">Pintasan Periode:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const todayStr = new Date().toISOString().substring(0, 10);
                      setAbsensiStartDate(todayStr);
                      setAbsensiEndDate(todayStr);
                    }}
                    className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setDate(end.getDate() - 7);
                      setAbsensiStartDate(start.toISOString().substring(0, 10));
                      setAbsensiEndDate(end.toISOString().substring(0, 10));
                    }}
                    className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    7 Hari Terakhir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const start = new Date(now.getFullYear(), now.getMonth(), 1);
                      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                      setAbsensiStartDate(start.toISOString().substring(0, 10));
                      setAbsensiEndDate(end.toISOString().substring(0, 10));
                    }}
                    className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    Bulan Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAbsensiStartDate("");
                      setAbsensiEndDate("");
                    }}
                    className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    Tampilkan Semua
                  </button>
                </div>
              </div>

              {/* Attendance Table logs representation */}
              <div className="bg-[#121214] border border-[#27272A] p-4">
                <h4 className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3">
                  Log Riwayat Kehadiran Terbaru ({filteredAbsensi.length})
                </h4>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {filteredAbsensi.length === 0 ? (
                    <p className="text-[10px] text-zinc-500 text-center italic py-6">Tidak menemukan log absensi karyawan.</p>
                  ) : (
                    filteredAbsensi.map((ab) => {
                      const checkIn = new Date(ab.checkInTime);
                      const checkOut = ab.checkOutTime ? new Date(ab.checkOutTime) : null;
                      return (
                        <div key={ab.id} className="bg-[#0A0A0B] border border-zinc-950 p-3 space-y-2 font-mono text-[10.5px] relative leading-normal">
                          <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                            <div>
                              <span className="font-extrabold font-sans text-white uppercase text-[11px] block">{ab.nama}</span>
                              <span className="text-[9px] text-zinc-500">Tanggal: {ab.tanggal}</span>
                            </div>
                            <span className={`text-[8.5px] font-sans font-black uppercase px-2 py-0.5 border ${
                              ab.status === "Hadir"
                                ? "bg-emerald-950/20 border-emerald-900/30 text-emerald-400"
                                : "bg-amber-950/20 border-amber-850/30 text-amber-500"
                            }`}>
                              {ab.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold text-zinc-350">
                            <div>
                              <span className="font-sans font-black text-[8px] text-zinc-500 uppercase block mb-0.5">Masuk Kerja</span>
                              <p className="text-white font-mono">{checkIn.toLocaleTimeString("id-ID", { timeStyle: "medium" })}</p>
                              <p className="text-[8.5px] text-zinc-550">Jarak: {ab.distanceIn ? `${ab.distanceIn}m` : "-"}</p>
                            </div>
                            <div>
                              <span className="font-sans font-black text-[8px] text-zinc-500 uppercase block mb-0.5">Pulang Kerja</span>
                              <p className="text-white font-mono">
                                {checkOut ? checkOut.toLocaleTimeString("id-ID", { timeStyle: "medium" }) : "Aktif Kerja"}
                              </p>
                              {ab.distanceOut && <p className="text-[8.5px] text-zinc-550">Jarak: {ab.distanceOut}m</p>}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LEAVE PERMISSION MODERATION */}
          {panelTab === "izin" && (
            <div className="space-y-4 text-left font-sans">
              
              <div className="bg-[#121214] border border-[#27272A] p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Pilih Karyawan</label>
                    <select
                      value={selectedStaffFilter}
                      onChange={(e) => setSelectedStaffFilter(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 text-xs rounded-none font-bold"
                    >
                      <option value="Semua">Semua Karyawan</option>
                      {karyawanList.map((st) => (
                        <option key={st.id} value={st.id}>{st.nama}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Mulai Tanggal</label>
                    <input
                      type="date"
                      value={izinStartDate}
                      onChange={(e) => setIzinStartDate(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-xs rounded-none font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Sampai Tanggal</label>
                    <input
                      type="date"
                      value={izinEndDate}
                      onChange={(e) => setIzinEndDate(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-xs rounded-none font-bold font-mono"
                    />
                  </div>
                </div>

                {/* Pintasan Periode Cepat untuk Izin */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#27272A]/50">
                  <span className="text-[8.5px] font-black text-[#A1A1AA] uppercase tracking-wider self-center mr-1">Pintasan Periode:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const todayStr = new Date().toISOString().substring(0, 10);
                      setIzinStartDate(todayStr);
                      setIzinEndDate(todayStr);
                    }}
                    className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setDate(end.getDate() - 7);
                      setIzinStartDate(start.toISOString().substring(0, 10));
                      setIzinEndDate(end.toISOString().substring(0, 10));
                    }}
                    className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    7 Hari Terakhir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const start = new Date(now.getFullYear(), now.getMonth(), 1);
                      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                      setIzinStartDate(start.toISOString().substring(0, 10));
                      setIzinEndDate(end.toISOString().substring(0, 10));
                    }}
                    className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    Bulan Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIzinStartDate("");
                      setIzinEndDate("");
                    }}
                    className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    Tampilkan Semua
                  </button>
                </div>
              </div>

              {/* Pending list */}
              <div className="bg-[#121214] border border-[#27272A] p-4">
                <h4 className="text-[10.5px] font-black text-amber-500 uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3.5">
                  Pengganti Izin Pending - Butuh ACC ({filteredIzin.filter(iz => iz.status === "Pending").length})
                </h4>

                <div className="space-y-2.5">
                  {filteredIzin.filter(iz => iz.status === "Pending").length === 0 ? (
                    <p className="text-[10px] text-zinc-400 italic text-center py-4">Tidak ada pengajuan izin pending.</p>
                  ) : (
                    filteredIzin.filter(iz => iz.status === "Pending").map((iz) => (
                      <div key={iz.id} className="bg-[#0A0A0B] border border-amber-950/40 p-3 space-y-3 leading-relaxed text-xs">
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                          <div>
                            <span className="font-extrabold uppercase text-white block">{iz.nama}</span>
                            <span className="font-mono text-[9px] text-[#fbbf24]">📅 Izin untuk: {iz.tanggal}</span>
                          </div>
                          <span className="text-[8px] bg-amber-950/20 border border-amber-900 text-amber-500 font-mono font-black uppercase px-2 py-0.5">
                            PENDING
                          </span>
                        </div>
                        <p className="text-[10.5px] text-zinc-400 italic">“{iz.alasan}”</p>
                        
                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            onClick={() => handleModerateLeave(iz.id, true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black uppercase tracking-wider cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Setujui (ACC)
                          </button>
                          <button
                            onClick={() => handleModerateLeave(iz.id, false)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-red-900 text-red-500 hover:bg-red-950 text-[10px] font-black uppercase tracking-wider cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" /> Tolak
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Moderated history */}
              <div className="bg-[#121214] border border-[#27272A] p-4">
                <h4 className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3">
                  Log Keputusan Moderasi Izin Selesai ({filteredIzin.filter(iz => iz.status !== "Pending").length})
                </h4>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {filteredIzin.filter(iz => iz.status !== "Pending").length === 0 ? (
                    <p className="text-[10px] text-zinc-500 italic text-center py-4">Belum ada keputusan izin yang dibuat.</p>
                  ) : (
                    filteredIzin.filter(iz => iz.status !== "Pending").map((iz) => (
                      <div key={iz.id} className="bg-[#0A0A0B] border border-zinc-950 p-2 text-[10.5px]">
                        <div className="flex items-center justify-between font-mono">
                          <div>
                            <span className="font-extrabold font-sans text-white uppercase block">{iz.nama}</span>
                            <span className="text-[9px] text-zinc-550">Tgl: {iz.tanggal}</span>
                          </div>
                          <span className={`text-[8px] font-bold uppercase border px-1.5 py-0.5 ${
                            iz.status === "Disetujui"
                              ? "bg-emerald-950/20 border-emerald-900/30 text-emerald-400"
                              : "bg-red-950/20 border-red-940/30 text-red-400"
                          }`}>
                            {iz.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PAYROLL / penggajian */}
          {panelTab === "gaji" && (
            <div className="space-y-4 text-left font-sans">
              
              <div className="bg-[#121214] border border-[#27272A] p-4 text-left leading-relaxed">
                <h4 className="text-[10.5px] font-black text-emerald-500 uppercase tracking-widest border-b border-[#27272A] pb-2 mb-2 flex items-center gap-1.5">
                  <CircleDollarSign className="w-4 h-4 shrink-0 text-emerald-500" /> KALKULASI GAJI MINGGUAN (KAMIS) & PENCATATAN
                </h4>
                
                <div className="bg-[#1A1A1E] border border-zinc-800 p-2.5 mb-3.5 text-xs text-left">
                  <span className="text-[8px] font-extrabold uppercase text-[#f59e0b] block mb-1">PERIODE HARI GAJIAN AKTIF:</span>
                  <p className="text-[11.5px] text-white font-mono font-bold">{getCurrentGajiPeriod().formatted.toUpperCase()}</p>
                </div>

                {/* Filter Periode Gaji */}
                <div className="bg-[#0A0A0B] border border-[#27272A] p-3 space-y-3 mb-3.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Mulai Tanggal</label>
                      <input
                        type="date"
                        value={gajiStartDate}
                        onChange={(e) => setGajiStartDate(e.target.value)}
                        className="w-full bg-[#121214] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-xs rounded-none font-bold font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Sampai Tanggal</label>
                      <input
                        type="date"
                        value={gajiEndDate}
                        onChange={(e) => setGajiEndDate(e.target.value)}
                        className="w-full bg-[#121214] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-xs rounded-none font-bold font-mono"
                      />
                    </div>
                  </div>

                  {/* Pintasan Periode Cepat untuk Gaji */}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#27272A]/50">
                    <span className="text-[8.5px] font-black text-[#A1A1AA] uppercase tracking-wider self-center mr-1">Pintasan Periode:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const todayStr = new Date().toISOString().substring(0, 10);
                        setGajiStartDate(todayStr);
                        setGajiEndDate(todayStr);
                      }}
                      className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                    >
                      Hari Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(end.getDate() - 7);
                        setGajiStartDate(start.toISOString().substring(0, 10));
                        setGajiEndDate(end.toISOString().substring(0, 10));
                      }}
                      className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                    >
                      7 Hari Terakhir
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const start = new Date(now.getFullYear(), now.getMonth(), 1);
                        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                        setGajiStartDate(start.toISOString().substring(0, 10));
                        setGajiEndDate(end.toISOString().substring(0, 10));
                      }}
                      className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                    >
                      Bulan Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGajiStartDate("");
                        setGajiEndDate("");
                      }}
                      className="text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                    >
                      Default Mingguan (Kamis)
                    </button>
                  </div>
                </div>

                <p className="text-[10.5px] text-zinc-400 font-bold leading-normal mb-3.5">
                  Kalkulasi ini mengukur uang makan sesuai tingkat kehadiran di periode tanggal gajian aktif, yang secara default dirancang untuk siklus mingguan (Jumat - Kamis).
                </p>

                <div className="space-y-3">
                  {karyawanList.length === 0 ? (
                    <p className="text-[10px] text-zinc-500 text-center italic py-4">Belum ada data staf Pegawai.</p>
                  ) : (
                    karyawanList.map((staf) => {
                      const weeklyPeriod = getCurrentGajiPeriod();
                      const currentMonthYMD = new Date().toISOString().substring(0, 7); // "YYYY-MM"
                      const countHadir = absensiList.filter(a => a.karyawanId === staf.id && a.tanggal >= weeklyPeriod.startStr && a.tanggal <= weeklyPeriod.endStr).length;
                      const weeklyBaseSalary = staf.gajiPokok / 4;
                      const totalMakan = countHadir * staf.uangMakan;
                      
                      const countLiburDisetujui = izinList.filter(iz => iz.karyawanId === staf.id && iz.status === "Disetujui" && iz.tanggal.startsWith(currentMonthYMD)).length;
                      const sisaLiburStr = `${Math.max(0, 3 - countLiburDisetujui)} / 3 Hari`;

                      const currentBonusInp = stafBonus[staf.id] !== undefined ? stafBonus[staf.id] : (staf.bonus || 0);
                      const currentKasbonInp = stafKasbon[staf.id] !== undefined ? stafKasbon[staf.id] : (staf.kasbon || 0);
                      const currentCatatanInp = stafCatatan[staf.id] !== undefined ? stafCatatan[staf.id] : (staf.catatanGaji || "");

                      const payoutGaji = weeklyBaseSalary + totalMakan + (staf.bonus || 0) - (staf.kasbon || 0);

                      return (
                        <div key={staf.id} className="bg-[#0A0A0B] border border-zinc-950 p-3.5 space-y-3.5 font-sans text-left">
                          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                             <span className="font-extrabold text-sm uppercase text-white">{staf.nama}</span>
                             <span className="text-[9.5px] font-mono text-zinc-400 bg-zinc-950 px-2.5 py-0.5 border border-zinc-900 font-semibold">
                              {countHadir} Hari Kerja Mingguan
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-semibold text-zinc-400 font-mono">
                            <div>
                              <p className="text-[8.5px] font-sans font-black text-zinc-550 uppercase">Gaji Pokok Mingguan (1/4)</p>
                              <p className="text-white">{formatIDR(weeklyBaseSalary)}</p>
                              <p className="text-[8px] text-zinc-650 font-normal">Bulanan: {formatIDR(staf.gajiPokok)}</p>
                            </div>
                            <div>
                              <p className="text-[8.5px] font-sans font-black text-zinc-550 uppercase">Total Uang Makan</p>
                              <p className="text-white">{formatIDR(totalMakan)}</p>
                              <p className="text-[9px] text-zinc-500 font-normal">({formatIDR(staf.uangMakan)}/hari)</p>
                            </div>
                            <div>
                              <p className="text-[8.5px] font-sans font-black text-zinc-550 uppercase">Bonus (Owner)</p>
                              <p className="text-emerald-450 font-bold">+ {formatIDR(staf.bonus || 0)}</p>
                            </div>
                            <div>
                              <p className="text-[8.5px] font-sans font-black text-zinc-550 uppercase">Potongan Kasbon</p>
                              <p className="text-red-400 font-bold">- {formatIDR(staf.kasbon || 0)}</p>
                            </div>
                          </div>

                          <div className="bg-[#141416] p-2 border border-zinc-900 text-[10.5px] text-zinc-400 flex items-center justify-between font-mono">
                            <span className="font-sans font-bold uppercase text-[8px] text-zinc-550">Analisis Libur Bulan Ini:</span>
                            <span className="text-[10px]">Cuti: <strong className="text-white">{countLiburDisetujui} Hari</strong> | Sisa Quota: <strong className="text-amber-500">{sisaLiburStr}</strong></span>
                          </div>

                          {/* Dynamic Inputs per user Row */}
                          <div className="bg-[#121214] border border-[#27272A] p-3 space-y-3 text-[11px]">
                            <span className="text-[8px] font-black uppercase tracking-wider text-[#A1A1AA] block border-b border-[#27272A] pb-1">Edit Parameter Slip Gaji (Owner)</span>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[7.5px] font-bold text-zinc-500 uppercase block mb-0.5">Bonus Insentif (Rp)</label>
                                <input
                                  type="number"
                                  value={currentBonusInp}
                                  onChange={(e) => setStafBonus({ ...stafBonus, [staf.id]: Number(e.target.value) })}
                                  className="w-full bg-[#0A0A0B] border border-zinc-900 focus:border-emerald-500 text-white font-mono px-2 py-1 outline-none rounded-none text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[7.5px] font-bold text-zinc-500 uppercase block mb-0.5">Potongan Kasbon (Rp)</label>
                                <input
                                  type="number"
                                  value={currentKasbonInp}
                                  onChange={(e) => setStafKasbon({ ...stafKasbon, [staf.id]: Number(e.target.value) })}
                                  className="w-full bg-[#0A0A0B] border border-zinc-900 focus:border-emerald-500 text-white font-mono px-2 py-1 outline-none rounded-none text-xs"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[7.5px] font-bold text-zinc-500 uppercase block mb-0.5">Catatan Tambahan Khusus</label>
                              <input
                                type="text"
                                value={currentCatatanInp}
                                onChange={(e) => setStafCatatan({ ...stafCatatan, [staf.id]: e.target.value })}
                                className="w-full bg-[#0A0A0B] border border-zinc-900 focus:border-emerald-500 text-white px-2 py-1 outline-none rounded-none text-xs"
                                placeholder="Gaji bulanan aman + lembur minggu ke-2"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleUpdateGajiParams(staf.id, currentBonusInp, currentKasbonInp, currentCatatanInp)}
                              className="w-full py-1 bg-[#1A1A1E] hover:bg-zinc-800 text-[#A1A1AA] hover:text-white border border-zinc-800 font-extrabold text-[8.5px] uppercase tracking-wider cursor-pointer"
                            >
                              Simpan Parameter Finansial Staf
                            </button>
                          </div>

                          <div className="pt-2.5 border-t border-dashed border-zinc-900 flex items-center justify-between">
                            <div>
                              <span className="text-[8.5px] font-black text-zinc-500 block uppercase leading-none">TOTAL GAJI NET BARU</span>
                              <span className="text-sm font-black font-mono text-emerald-400">
                                {formatIDR(payoutGaji)}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => downloadSlipGajiForStaf(staf)}
                                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-[#1A1A1E] text-zinc-400 hover:text-white border border-zinc-800 font-bold text-[10px] uppercase cursor-pointer flex items-center gap-1"
                              >
                                <Download className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Unduh PDF</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleProcessPayroll(staf, countHadir, totalMakan)}
                                className="px-3.5 py-1.5 bg-zinc-950 hover:bg-zinc-900 text-emerald-450 hover:text-emerald-400 border border-emerald-950/60 hover:border-emerald-500 font-black text-[10px] uppercase cursor-pointer"
                              >
                                Bayar & Rekam Pengeluaran
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: LOKASI LAT/LONG OUTLET CONFIGURATION */}
          {panelTab === "lokasi" && (
            <div className="space-y-4 text-left">
              
              <form onSubmit={handleSaveLocation} className="bg-[#121214] border border-[#27272A] p-4 space-y-4 font-sans text-xs">
                <h4 className="text-[10.5px] font-black text-emerald-500 uppercase tracking-widest border-b border-[#27272A] pb-2">
                  KONFIGURASI TITIK KOORDINAT GPS OUTLET LAUNDRY
                </h4>
                
                <p className="text-[10px] text-zinc-400 font-bold leading-relaxed">
                  Tentukan titik pusat peta (Latitude / Longitude) outlet laundry Anda beserta radius limit (dalam satuan meter) untuk menyempurnakan otentikasi lokasi absensi karyawan.
                </p>

                <div className="space-y-3 font-semibold text-zinc-300">
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Nama Lokasi Outlet</label>
                    <input
                      type="text"
                      required
                      value={locationConfig.namaLokasi}
                      onChange={(e) => setLocationConfig(prev => ({ ...prev, namaLokasi: e.target.value }))}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div>
                      <label className="text-[9px] font-sans font-black uppercase text-zinc-500 block mb-1">Latitude</label>
                      <input
                        type="number"
                        step="0.00000001"
                        required
                        value={locationConfig.latitude}
                        onChange={(e) => setLocationConfig(prev => ({ ...prev, latitude: Number(e.target.value) }))}
                        className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-sans font-black uppercase text-zinc-500 block mb-1">Longitude</label>
                      <input
                        type="number"
                        step="0.00000001"
                        required
                        value={locationConfig.longitude}
                        onChange={(e) => setLocationConfig(prev => ({ ...prev, longitude: Number(e.target.value) }))}
                        className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Radius Toleransi Maksimal (Meter)</label>
                    <input
                      type="number"
                      required
                      value={locationConfig.radius}
                      onChange={(e) => setLocationConfig(prev => ({ ...prev, radius: Number(e.target.value) }))}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                    />
                    <p className="text-[8.5px] text-zinc-550 leading-tight mt-1">
                      Contoh: 100 artinya karyawan dapat melakukan cek absensi maksimal berjarak 100 meter dari titik koordinat outlet pusat.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={savingLocation}
                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest rounded-none transition-all cursor-pointer"
                  >
                    {savingLocation ? "MEMPERBARUI..." : "SIMPAN KONFIGURASI GPS"}
                  </button>
                  <button
                    type="button"
                    onClick={handleGetCurrentCoords}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-zinc-950 hover:bg-zinc-900 border border-[#27272A] font-black text-xs uppercase text-zinc-300 rounded-none"
                    title="Gunakan koordinat HP gps saya saat ini"
                  >
                    <MapIcon className="w-3.5 h-3.5 text-emerald-450" />
                    <span>GPS Saya</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
