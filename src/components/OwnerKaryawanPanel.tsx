import React, { useState, useEffect, useRef } from "react";
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
  Eye,
  ChevronDown,
  Sparkles,
  Search,
  History,
  Rocket,
  Radio,
  Phone,
  RotateCw,
  Sun,
  Sunset,
  FileSpreadsheet,
  FileText,
  Scissors
} from "lucide-react";
import { Karyawan, Absensi, Izin, LocationConfig, Expense, KasbonHistory, ShiftType, PotonganGaji } from "../types";
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, getDocs, getDoc, writeBatch } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { 
  exportKasbonSinglePDF, 
  exportKasbonSingleCSV, 
  exportKasbonAllEmployeesPDF, 
  exportKasbonAllEmployeesCSV,
  enrichKasbonHistory,
  EnrichedKasbonHistory
} from "../utils/kasbonExport";
import { ShiftHistoryView } from "./ShiftHistoryView";
import { getMondayOfDate, dateToYMD } from "../utils/shiftUtils";

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
  expenses?: Expense[];
  onDeleteExpense?: (id: string) => Promise<void> | void;
}

export function OwnerKaryawanPanel({
  ownerId,
  onAddExpense,
  triggerConfirm,
  expenses = [],
  onDeleteExpense
}: OwnerKaryawanPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [panelTab, setPanelTab] = useState<"karyawan" | "absen" | "izin" | "gaji" | "lokasi">("karyawan");
  const [subTab, setSubTab] = useState<"staf" | "admin">("staf");
  const [absenSubTab, setAbsenSubTab] = useState<"log" | "shift">("log");
  const [gajiSubTab, setGajiSubTab] = useState<"kalkulasi" | "potongan" | "pencairan">("kalkulasi");
  const [disbRincianStaffFilter, setDisbRincianStaffFilter] = useState<string>("Semua");
  const [disbRincianTypeFilter, setDisbRincianTypeFilter] = useState<"Semua" | "Gaji Awal" | "Bonus" | "Kasbon">("Semua");
  const [disbRincianSearch, setDisbRincianSearch] = useState<string>("");
  const [gajiStaffFilter, setGajiStaffFilter] = useState<string>("Semua");

  // States for potongan gaji tambahan (additional deductions with reason column)
  const [potonganGajiList, setPotonganGajiList] = useState<PotonganGaji[]>([]);
  const [inputPotonganKaryawanId, setInputPotonganKaryawanId] = useState<string>("");
  const [inputPotonganAmount, setInputPotonganAmount] = useState<string>("");
  const [inputPotonganTanggal, setInputPotonganTanggal] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [inputPotonganAlasan, setInputPotonganAlasan] = useState<string>("");

  // Table filters for potongan gaji
  const [potonganStaffFilter, setPotonganStaffFilter] = useState<string>("Semua");
  const [potonganStatusFilter, setPotonganStatusFilter] = useState<"Semua" | "aktif" | "dipotong">("Semua");
  const [potonganSearch, setPotonganSearch] = useState<string>("");

  // Modal dialog for quick deduction input from employee card
  const [activeAddPotonganKaryawanId, setActiveAddPotonganKaryawanId] = useState<string | null>(null);
  const [modalPotonganAmount, setModalPotonganAmount] = useState<string>("");
  const [modalPotonganTanggal, setModalPotonganTanggal] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [modalPotonganAlasan, setModalPotonganAlasan] = useState<string>("");

  // Database lists
  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [adminList, setAdminList] = useState<any[]>([]);
  const [absensiList, setAbsensiList] = useState<Absensi[]>([]);
  const [izinList, setIzinList] = useState<Izin[]>([]);
  
  // Dynamic user-edited state arrays mapped per Employee ID
  const [stafBonus, setStafBonus] = useState<{ [id: string]: number }>({});
  const [stafKasbon, setStafKasbon] = useState<{ [id: string]: number }>({});
  const [stafCatatan, setStafCatatan] = useState<{ [id: string]: string }>({});
  const [stafKasbonPotong, setStafKasbonPotong] = useState<{ [id: string]: number }>({});
  const [stafKasbonPotongNotes, setStafKasbonPotongNotes] = useState<{ [id: string]: string }>({});
  const [deductionAppliedToDb, setDeductionAppliedToDb] = useState<{ [id: string]: boolean }>({});
  const [tambahKasbonInput, setTambahKasbonInput] = useState<{ [stafId: string]: string }>({});
  const [tambahBonusInput, setTambahBonusInput] = useState<{ [stafId: string]: string }>({});
  const [tambahKasbonDate, setTambahKasbonDate] = useState<{ [stafId: string]: string }>({});
  const [tambahBonusDate, setTambahBonusDate] = useState<{ [stafId: string]: string }>({});

  const getTodayDateStr = () => {
    const today = new Date();
    return today.getFullYear() + "-" + 
      String(today.getMonth() + 1).padStart(2, "0") + "-" + 
      String(today.getDate()).padStart(2, "0");
  };

  // Helper formatting for rupiah input parsing
  const formatRupiah = (value: string): string => {
    const clean = value.replace(/\D/g, "");
    if (!clean) return "";
    return Number(clean).toLocaleString("id-ID");
  };

  const parseRupiah = (value: string): number => {
    const clean = value.replace(/\D/g, "");
    return clean ? parseInt(clean, 10) : 0;
  };

  // Dynamic states for inline cashouts/bonus per employee
  const [activeDisbKaryawanId, setActiveDisbKaryawanId] = useState<string | null>(null);
  const [activeDisbType, setActiveDisbType] = useState<"withdrawal" | "bonus" | null>(null);

  // States for manual kasbon deduction dialog
  const [activeDeductKaryawanId, setActiveDeductKaryawanId] = useState<string | null>(null);
  const [deductKasbonInput, setDeductKasbonInput] = useState<string>("");
  const [deductKasbonNotes, setDeductKasbonNotes] = useState<string>("");

  // States for kasbon history tracking
  const [kasbonHistoryList, setKasbonHistoryList] = useState<KasbonHistory[]>([]);
  const [activeHistoryKaryawanId, setActiveHistoryKaryawanId] = useState<string | null>(null);

  // State for employee salary/payroll history modal
  const [activeGajiHistoryKaryawanId, setActiveGajiHistoryKaryawanId] = useState<string | null>(null);

  // States for early paycheck withdrawal disb
  const [disbAmount, setDisbAmount] = useState("");
  const [disbPaymentMethod, setDisbPaymentMethod] = useState("Transfer");
  const [disbDate, setDisbDate] = useState(() => new Date().toISOString().substring(0, 10));

  // States for bonus disb
  const [disbBonusAmount, setDisbBonusAmount] = useState("");
  const [disbBonusPaymentMethod, setDisbBonusPaymentMethod] = useState("Transfer");
  const [disbBonusDate, setDisbBonusDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [disbBonusNotes, setDisbBonusNotes] = useState("");

  const [locationConfig, setLocationConfig] = useState<LocationConfig>({
    latitude: -6.2088,
    longitude: 106.8456,
    radius: 100,
    namaLokasi: "Outlet Damdam Laundry",
    alamatLokasi: "Jagakarsa, Kota Jakarta Selatan",
    teleponLokasi: "085743031695",
    jamBukaLokasi: "07.30 - 21.00",
    ketentuanNota: "1. Pembayaran Qris wajib kirim bukti\n2. Pengaduan Komplain max 1x24 jam\n3. Kerusakan luntur, susut dan berkerut akibat proses pencucian bukan tanggung jawab kami.\n4. Jumlah pakaian yang tidak dihitung oleh pelanggan bukan tanggung jawab kami dan hitungan kami yang dianggap benar."
  });

  const isExpenseLinkedToStaf = (exp: any, k: any): boolean => {
    if (!exp) return false;
    
    const titleLower = (exp.title || "").toLowerCase();
    const subCategoryLower = (exp.subCategory || "").toLowerCase();

    // 1. Pencairan bonus / lembur itu tambahan uang/insentif yang tidak boleh memotong/mengurangi gaji dasar mingguan.
    // Jadi jika judul atau subkategori mengandung kata "bonus" atau "lembur", kita abaikan dari pemotongan gaji.
    if (
      subCategoryLower.includes("bonus") || 
      subCategoryLower.includes("lembur") || 
      titleLower.includes("bonus") || 
      titleLower.includes("lembur")
    ) {
      return false;
    }

    // 1b. Transaksi kategori "Kasbon Karyawan" adalah transaksi pemberian kasbon (pinjaman uang ke karyawan).
    // Transaksi ini TIDAK boleh memotong gaji mingguan secara otomatis sebagai pencairan gaji/payout.
    if (exp.category === "Kasbon Karyawan") {
      return false;
    }

    // 1c. Transaksi pembayaran gaji pokok/mingguan rutin adalah transaksi pembayaran gaji akhir itu sendiri,
    // BUKAN pencairan gaji awal / uang muka. Jangan dikurangkan lagi dari total gaji.
    if (
      subCategoryLower.includes("rutin") ||
      subCategoryLower.includes("pokok") ||
      titleLower.includes("gaji mingguan staf") ||
      titleLower.includes("gaji pokok")
    ) {
      return false;
    }

    // 2. Jika karyawanId cocok, maka transaksi pencairan gaji awal / uang muka
    if (exp.karyawanId === k.id) {
      return true;
    }
    
    // 3. Fallback: Jika tercatat di kategori "Gaji Karyawan" dengan judul pencairan gaji awal / uang muka untuk nama staf tersebut
    const nameLower = (k.nama || "").toLowerCase();
    if (exp.category === "Gaji Karyawan" && (titleLower.includes(`pencairan gaji staf: ${nameLower}`) || titleLower.includes(`uang muka: ${nameLower}`))) {
      return true;
    }

    return false;
  };

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
  const [karyawanTelepon, setKaryawanTelepon] = useState<string>("");
  const [karyawanCurrentShift, setKaryawanCurrentShift] = useState<ShiftType>("pagi");
  const [karyawanAutoRolling, setKaryawanAutoRolling] = useState<boolean>(true);
  const [karyawanGaji, setKaryawanGaji] = useState<number>(1500000);
  const [karyawanMakan, setKaryawanMakan] = useState<number>(20000);
  const [karyawanKasbon, setKaryawanKasbon] = useState<number>(0);
  const [karyawanBonus, setKaryawanBonus] = useState<number>(0);
  const [karyawanCatatanGaji, setKaryawanCatatanGaji] = useState<string>("");

  // Helper function to get yesterday YMD
  const getYesterdayYMD = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().substring(0, 10);
  };

  // Helper to generate dates between startDate and endDate
  const getDatesInRange = (startDateStr: string, endDateStr: string, excludeSunday = false): string[] => {
    const dates: string[] = [];
    if (!startDateStr) return dates;
    const end = endDateStr || startDateStr;
    if (end < startDateStr) return dates;

    const cur = new Date(startDateStr);
    const stop = new Date(end);

    let count = 0;
    while (cur <= stop && count < 365) {
      count++;
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, "0");
      const dd = String(cur.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;

      if (!excludeSunday || cur.getDay() !== 0) {
        dates.push(dateStr);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  };

  // Manual Absen states
  const [showManualAbsen, setShowManualAbsen] = useState<boolean>(false);
  const [manualAbsenMode, setManualAbsenMode] = useState<"single" | "range">("single");
  const [manualAbsenStaffId, setManualAbsenStaffId] = useState<string>("");
  const [manualAbsenDate, setManualAbsenDate] = useState<string>(getYesterdayYMD());
  const [manualAbsenEndDate, setManualAbsenEndDate] = useState<string>(getYesterdayYMD());
  const [manualAbsenExcludeSunday, setManualAbsenExcludeSunday] = useState<boolean>(false);
  const [manualAbsenStatus, setManualAbsenStatus] = useState<"Hadir" | "Terlambat">("Hadir");
  const [manualAbsenCheckIn, setManualAbsenCheckIn] = useState<string>("08:00");
  const [manualAbsenCheckOut, setManualAbsenCheckOut] = useState<string>("17:00");
  const [manualAbsenSubmitting, setManualAbsenSubmitting] = useState<boolean>(false);

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
        all.push({ ...d.data(), id: d.id } as Karyawan);
      });
      all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setKaryawanList(all);
      setLoading(false);
    });

    const admRef = collection(db, "users", ownerId, "admins");
    const unsubAdm = onSnapshot(admRef, (snap) => {
      const all: any[] = [];
      snap.forEach((d) => {
        all.push(d.data());
      });
      all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setAdminList(all);
    });

    const absRef = collection(db, "users", ownerId, "absensi");
    const unsubAbs = onSnapshot(absRef, (snap) => {
      const all: Absensi[] = [];
      snap.forEach((d) => {
        all.push(d.data() as Absensi);
      });
      all.sort((a, b) => (b.checkInTime || "").localeCompare(a.checkInTime || ""));
      setAbsensiList(all);
    });

    const izRef = collection(db, "users", ownerId, "izin");
    const unsubIz = onSnapshot(izRef, (snap) => {
      const all: Izin[] = [];
      snap.forEach((d) => {
        all.push(d.data() as Izin);
      });
      all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setIzinList(all);
    });

    const kasHistRef = collection(db, "users", ownerId, "kasbon_history");
    const unsubKasHist = onSnapshot(kasHistRef, (snap) => {
      const all: KasbonHistory[] = [];
      snap.forEach((d) => {
        all.push(d.data() as KasbonHistory);
      });
      all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setKasbonHistoryList(all);
    }, (error) => {
      console.error("Firestore listen kasbon_history error:", error);
    });

    const potGajiRef = collection(db, "users", ownerId, "potongan_gaji");
    const unsubPotGaji = onSnapshot(potGajiRef, (snap) => {
      const all: PotonganGaji[] = [];
      snap.forEach((d) => {
        all.push(d.data() as PotonganGaji);
      });
      all.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
      setPotonganGajiList(all);
    }, (error) => {
      console.error("Firestore listen potongan_gaji error:", error);
    });

    return () => {
      unsubKar();
      unsubAdm();
      unsubAbs();
      unsubIz();
      unsubKasHist();
      unsubPotGaji();
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
    const oldStafRecord = isEditingKaryawan ? karyawanList.find((k) => k.id === targetId) : undefined;
    const targetPayload: Karyawan = {
      id: targetId,
      nama: karyawanNama.trim(),
      username: cleanUser,
      password: karyawanPass.trim(),
      telepon: karyawanTelepon.trim(),
      currentShift: karyawanCurrentShift,
      shiftAnchorDate: dateToYMD(getMondayOfDate(new Date())),
      autoRollingShift: karyawanAutoRolling,
      gajiPokok: karyawanGaji,
      uangMakan: karyawanMakan,
      bonus: karyawanBonus,
      kasbon: karyawanKasbon,
      catatanGaji: karyawanCatatanGaji,
      createdAt: isEditingKaryawan ? (oldStafRecord?.createdAt || new Date().toISOString()) : new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "users", ownerId, "karyawan", targetId), targetPayload);
      
      // Log changes to kasbon_history
      if (isEditingKaryawan) {
        const oldStaf = karyawanList.find((k) => k.id === targetId);
        const oldKasbon = oldStaf ? (oldStaf.kasbon || 0) : 0;
        const diff = karyawanKasbon - oldKasbon;
        if (diff !== 0) {
          const historyId = "KSB-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
          const histRef = doc(db, "users", ownerId, "kasbon_history", historyId);
          await setDoc(histRef, {
            id: historyId,
            karyawanId: targetId,
            karyawanNama: targetPayload.nama,
            tipe: diff > 0 ? "penambahan" : "pengurangan",
            jumlah: Math.abs(diff),
            tanggal: getTodayDateStr(),
            keterangan: `Penyesuaian saldo kasbon via edit profil staf oleh Owner (dari Rp ${oldKasbon.toLocaleString()} menjadi Rp ${karyawanKasbon.toLocaleString()})`,
            createdAt: new Date().toISOString()
          });
        }
      } else {
        // New employee with starting kasbon
        if (karyawanKasbon > 0) {
          const historyId = "KSB-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
          const histRef = doc(db, "users", ownerId, "kasbon_history", historyId);
          await setDoc(histRef, {
            id: historyId,
            karyawanId: targetId,
            karyawanNama: targetPayload.nama,
            tipe: "penambahan",
            jumlah: karyawanKasbon,
            tanggal: getTodayDateStr(),
            keterangan: `Saldo kasbon awal saat pendaftaran akun staf oleh Owner`,
            createdAt: new Date().toISOString()
          });
        }
      }

      const successMsg = isEditingKaryawan 
        ? `Berhasil memperbarui data karyawan: ${targetPayload.nama}!` 
        : `Berhasil mendaftarkan karyawan baru: ${targetPayload.nama}!`;
      alert(successMsg);

      // Clear forms
      setKaryawanNama("");
      setKaryawanUser("");
      setKaryawanPass("");
      setKaryawanTelepon("");
      setKaryawanCurrentShift("pagi");
      setKaryawanAutoRolling(true);
      setKaryawanGaji(1500000);
      setKaryawanMakan(20000);
      setKaryawanBonus(0);
      setKaryawanKasbon(0);
      setKaryawanCatatanGaji("");
      setIsEditingKaryawan(false);
      setEditKaryawanId(null);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      console.error("Gagal menyimpan karyawan:", err);
      handleFirestoreError(
        err, 
        isEditingKaryawan ? OperationType.UPDATE : OperationType.CREATE, 
        `users/${ownerId}/karyawan/${targetId}`
      );
    }
  };

  const handleEditClick = (k: Karyawan) => {
    setIsEditingKaryawan(true);
    setEditKaryawanId(k.id);
    setKaryawanNama(k.nama);
    setKaryawanUser(k.username);
    setKaryawanPass(k.password);
    setKaryawanTelepon(k.telepon || "");
    setKaryawanCurrentShift(k.currentShift || "pagi");
    setKaryawanAutoRolling(k.autoRollingShift !== false);
    setKaryawanGaji(k.gajiPokok);
    setKaryawanMakan(k.uangMakan);
    setKaryawanBonus(k.bonus || 0);
    setKaryawanKasbon(k.kasbon || 0);
    setKaryawanCatatanGaji(k.catatanGaji || "");

    // Smooth scroll up to form using both container ref and native scrollIntoView
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
    const formElement = document.getElementById("form-edit-karyawan");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
          handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/karyawan/${id}`);
        }
      },
      true,
      "YA, HAPUS AKUN",
      "BATAL"
    );
  };

  const handleSaveManualAbsen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAbsenStaffId) {
      alert("Silakan pilih staf karyawan terlebih dahulu.");
      return;
    }

    const employeeObj = karyawanList.find(k => k.id === manualAbsenStaffId);
    if (!employeeObj) {
      alert("Staf karyawan tidak ditemukan.");
      return;
    }

    let targetDates: string[] = [];
    if (manualAbsenMode === "range") {
      if (!manualAbsenDate) {
        alert("Silakan pilih tanggal awal absensi.");
        return;
      }
      if (!manualAbsenEndDate) {
        alert("Silakan pilih tanggal akhir absensi.");
        return;
      }
      if (manualAbsenEndDate < manualAbsenDate) {
        alert("Tanggal akhir tidak boleh lebih awal dari tanggal awal.");
        return;
      }
      targetDates = getDatesInRange(manualAbsenDate, manualAbsenEndDate, manualAbsenExcludeSunday);
      if (targetDates.length === 0) {
        alert("Tidak ada tanggal valid dalam rentang tanggal yang dipilih.");
        return;
      }
    } else {
      if (!manualAbsenDate) {
        alert("Silakan pilih tanggal absensi.");
        return;
      }
      targetDates = [manualAbsenDate];
    }

    setManualAbsenSubmitting(true);

    try {
      const batch = writeBatch(db);

      for (const dateStr of targetDates) {
        const absId = `abs-${manualAbsenStaffId}-${dateStr}`;
        const logDocRef = doc(db, "users", ownerId, "absensi", absId);

        let checkInTimeStr = "";
        try {
          checkInTimeStr = new Date(`${dateStr}T${manualAbsenCheckIn}`).toISOString();
        } catch (err) {
          checkInTimeStr = `${dateStr}T${manualAbsenCheckIn}:00.000Z`;
        }

        let checkOutTimeStr: string | undefined = undefined;
        if (manualAbsenCheckOut) {
          try {
            checkOutTimeStr = new Date(`${dateStr}T${manualAbsenCheckOut}`).toISOString();
          } catch (err) {
            checkOutTimeStr = `${dateStr}T${manualAbsenCheckOut}:00.000Z`;
          }
        }

        const newLog: Absensi = {
          id: absId,
          karyawanId: manualAbsenStaffId,
          nama: employeeObj.nama,
          tanggal: dateStr,
          checkInTime: checkInTimeStr,
          latitudeIn: locationConfig.latitude || -6.2,
          longitudeIn: locationConfig.longitude || 106.8,
          distanceIn: 0,
          status: manualAbsenStatus
        };

        if (checkOutTimeStr) {
          newLog.checkOutTime = checkOutTimeStr;
          newLog.latitudeOut = locationConfig.latitude || -6.2;
          newLog.longitudeOut = locationConfig.longitude || 106.8;
          newLog.distanceOut = 0;
        }

        batch.set(logDocRef, newLog);
      }

      await batch.commit();

      if (targetDates.length === 1) {
        alert(`Sukses mencatat absensi manual untuk ${employeeObj.nama} pada tanggal ${targetDates[0]}!`);
      } else {
        alert(`Sukses mencatat absensi manual sekaligus untuk ${employeeObj.nama} sebanyak ${targetDates.length} hari (${targetDates[0]} s/d ${targetDates[targetDates.length - 1]})!`);
      }

      setShowManualAbsen(false);
      setManualAbsenStaffId("");
      setManualAbsenDate(getYesterdayYMD());
      setManualAbsenEndDate(getYesterdayYMD());
      setManualAbsenMode("single");
      setManualAbsenExcludeSunday(false);
      setManualAbsenStatus("Hadir");
      setManualAbsenCheckIn("08:00");
      setManualAbsenCheckOut("17:00");
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/absensi`);
    } finally {
      setManualAbsenSubmitting(false);
    }
  };

  const handleDeleteAbsensi = (id: string, nama: string, tanggal: string) => {
    triggerConfirm(
      "HAPUS LOG ABSENSI",
      `Apakah Anda yakin ingin menghapus catatan absensi ${nama} tanggal ${tanggal}? Tindakan ini berdampak pada komponen kalkulasi gaji uang makan.`,
      async () => {
        try {
          await deleteDoc(doc(db, "users", ownerId, "absensi", id));
          alert(`Log absensi ${nama} tanggal ${tanggal} berhasil dihapus.`);
        } catch (err) {
          console.error(err);
          handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/absensi/${id}`);
        }
      },
      true,
      "YA, HAPUS LOG",
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
      handleFirestoreError(
        err, 
        isEditingAdmin ? OperationType.UPDATE : OperationType.CREATE, 
        `users/${ownerId}/admins/${targetId}`
      );
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
          handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/admins/${id}`);
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
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/izin/${id}`);
    }
  };

  // Delete Izin log (e.g. for wrong date input or canceled requests)
  const handleDeleteIzin = (id: string) => {
    const targetIzin = izinList.find((iz) => iz.id === id);
    if (!targetIzin) return;

    const tglInfo = `${targetIzin.tanggal}${targetIzin.tanggalSelesai && targetIzin.tanggalSelesai !== targetIzin.tanggal ? ` s/d ${targetIzin.tanggalSelesai}` : ""}`;

    triggerConfirm(
      "HAPUS LOG IZIN LIBUR",
      `Apakah Anda yakin ingin menghapus data pengajuan izin libur untuk "${targetIzin.nama}" (Periode: ${tglInfo}, Status: ${targetIzin.status})? Data ini akan dihapus permanen dari sistem. Tindakan ini berguna jika ada salah input tanggal.`,
      async () => {
        try {
          await deleteDoc(doc(db, "users", ownerId, "izin", id));
        } catch (err) {
          console.error(err);
          handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/izin/${id}`);
        }
      },
      true,
      "Hapus Izin",
      "Batal"
    );
  };

  // Set Outlet center location coordinates
  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLocation(true);
    try {
      await setDoc(doc(db, "users", ownerId, "settings", "location"), locationConfig);
      alert("Konfigurasi outlet dan Ketentuan template WhatsApp berhasil diperbarui!");
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/settings/location`);
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

  // State for broadcasting system updates
  const [broadcastingUpdate, setBroadcastingUpdate] = useState(false);
  const [lastBroadcastStatus, setLastBroadcastStatus] = useState<string | null>(null);

  const handleBroadcastSystemUpdate = async () => {
    if (!ownerId) return;
    setBroadcastingUpdate(true);
    try {
      // 1. Fetch current version info from API
      let versionData = {
        version: "1.4.3",
        versionCode: 143,
        publishedAt: new Date().toISOString(),
        title: "Pembaruan Sistem Damdam Laundry",
        description: "Versi terbaru sistem telah dipublikasikan dengan fitur & performa terbaru.",
        changelog: [
          "Fitur hapus log pengajuan & keputusan izin libur (koreksi salah tanggal)",
          "Peningkatan popup notifikasi pembaruan sistem yang ringkas di tengah layar",
          "Optimasi sinkronisasi database dan pencatatan absensi"
        ],
        forceReload: false
      };

      try {
        const res = await fetch(`/api/system-version?t=${Date.now()}`);
        if (res.ok) {
          versionData = await res.json();
          versionData.publishedAt = new Date().toISOString();
        }
      } catch (_) {}

      // 2. Broadcast to Firestore document so all connected devices receive real-time snapshot
      await setDoc(doc(db, "users", ownerId, "system_updates", "latest"), versionData);
      
      setLastBroadcastStatus(`Notifikasi update versi ${versionData.version} berhasil disiarkan ke semua HP/perangkat aktif!`);
      setTimeout(() => setLastBroadcastStatus(null), 5000);
    } catch (err: any) {
      console.error("Gagal menyiarkan update:", err);
      alert("Gagal menyiarkan notifikasi update: " + (err.message || String(err)));
    } finally {
      setBroadcastingUpdate(false);
    }
  };

  const handleProcessDisbGajiAwal = async (stafId: string, amountStr: string, method: string, dateStr: string) => {
    const amountVal = parseRupiah(amountStr);
    if (!stafId) return;
    if (amountVal <= 0) {
      alert("Harap isi nominal pencairan dengan benar!");
      return;
    }

    const targetKaryawan = karyawanList.find((k) => k.id === stafId);
    if (!targetKaryawan) return;

    try {
      await onAddExpense({
        title: `Pencairan Gaji Staf: ${targetKaryawan.nama}`,
        amount: amountVal,
        category: "Gaji Karyawan",
        subCategory: "Pencairan Gaji",
        date: dateStr,
        paymentMethod: method,
        notes: `Pencairan gaji awal/kasbon instan staf ${targetKaryawan.nama} lewat kasir.`,
        karyawanId: targetKaryawan.id,
        pencairanGaji: true
      });

      alert(`Berhasil mencairkan gaji awal untuk ${targetKaryawan.nama} sebesar ${formatIDR(amountVal)}!`);
      setActiveDisbKaryawanId(null);
      setActiveDisbType(null);
      setDisbAmount("");
    } catch (err) {
      console.error("Gagal menambah pencairan gaji awal:", err);
      alert("Gagal menambah pencairan gaji awal: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleProcessDisbBonus = async (stafId: string, amountStr: string, method: string, dateStr: string, notesText: string) => {
    const amountVal = parseRupiah(amountStr);
    if (!stafId) return;
    if (amountVal <= 0) {
      alert("Harap isi nominal pencairan dengan benar!");
      return;
    }

    const targetKaryawan = karyawanList.find((k) => k.id === stafId);
    if (!targetKaryawan) return;

    const availableBonus = targetKaryawan.bonus || 0;
    if (amountVal > availableBonus) {
      alert(`Nominal pencairan (${formatIDR(amountVal)}) melebihi bonus tersedia (${formatIDR(availableBonus)}).`);
      return;
    }

    const doProcess = async () => {
      try {
        const stafRef = doc(db, "users", ownerId, "karyawan", targetKaryawan.id);
        const newBonus = Math.max(0, availableBonus - amountVal);

        // 1. Deduct from Karyawan bonus in Firestore
        await setDoc(stafRef, {
          bonus: newBonus
        }, { merge: true });

        // 2. Add Expense
        await onAddExpense({
          title: `Pencairan Bonus Staf: ${targetKaryawan.nama}`,
          amount: amountVal,
          category: "Gaji Karyawan",
          subCategory: "Bonus / Lembur",
          date: dateStr,
          paymentMethod: method,
          notes: `Pencairan bonus staf lewat kasir. ${notesText ? "Catatan: " + notesText : ""}`,
          karyawanId: targetKaryawan.id,
          pencairanBonus: true
        });

        alert(`Berhasil mencairkan bonus ${targetKaryawan.nama} sebesar ${formatIDR(amountVal)}!\nSisa pending bonus staf sekarang: ${formatIDR(newBonus)}.`);
        setActiveDisbKaryawanId(null);
        setActiveDisbType(null);
        setDisbBonusAmount("");
        setDisbBonusNotes("");
      } catch (err) {
        console.error("Gagal melakukan pencairan bonus:", err);
        alert("Gagal melakukan pencairan bonus: " + (err instanceof Error ? err.message : String(err)));
      }
    };

    if (triggerConfirm) {
      triggerConfirm(
        "CAIRKAN BONUS STAF",
        `Apakah Anda yakin ingin mencairkan bonus untuk ${targetKaryawan.nama} sebesar ${formatIDR(amountVal)}?\n\n` +
        `Sistem akan: \n` +
        `1. Mengurangi parameter bonus pending staf sebanyak ${formatIDR(amountVal)}.\n` +
        `2. Membuat catatan pengeluaran "Gaji Karyawan" senilai ${formatIDR(amountVal)} tanpa memotong gaji dasar.`,
        doProcess
      );
    } else {
      if (confirm(`Apakah Anda yakin ingin mencairkan bonus untuk ${targetKaryawan.nama} sebesar ${formatIDR(amountVal)}?`)) {
        await doProcess();
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
        } else {
          await deleteDoc(doc(db, "users", ownerId, "expenses", item.id));
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

  const handleCancelPencairanGaji = async (item: Expense) => {
    if (!ownerId || !item.id) return;

    const isKasbon = item.category === "Kasbon Karyawan";

    const processDelete = async () => {
      try {
        if (onDeleteExpense) {
          await onDeleteExpense(item.id);
        } else {
          await deleteDoc(doc(db, "users", ownerId, "expenses", item.id));
        }

        // Clear local overrides so the UI immediately uses the updated database values
        if (item.karyawanId) {
          setStafKasbon((prev) => {
            const copy = { ...prev };
            delete copy[item.karyawanId!];
            return copy;
          });
          setStafKasbonPotong((prev) => {
            const copy = { ...prev };
            delete copy[item.karyawanId!];
            return copy;
          });
        }

        alert(isKasbon ? "Berhasil menghapus/membatalkan pencatatan pemberian kasbon!" : "Berhasil menghapus/membatalkan pencairan gaji awal (uang muka)!");
      } catch (err) {
        console.error("Gagal menghapus:", err);
        alert("Gagal membatalkan transaksi: " + (err instanceof Error ? err.message : String(err)));
      }
    };

    if (triggerConfirm) {
      triggerConfirm(
        isKasbon ? "BATALKAN PEMBERIAN KASBON" : "BATALKAN GAJI AWAL (UANG MUKA)",
        isKasbon 
          ? `Apakah Anda yakin ingin membatalkan pemberian kasbon senilai ${formatIDR(item.amount)} ini?\nTindakan ini akan menghapus catatan pengeluaran terkait dan mengembalikan sisa saldo kasbon karyawan.` 
          : `Apakah Anda yakin ingin membatalkan pencairan gaji awal senilai ${formatIDR(item.amount)} ini?\nTindakan ini akan menghapus catatan transaksi pengeluaran terkait.`,
        processDelete,
        true
      );
    } else {
      if (confirm(isKasbon 
        ? `Apakah Anda yakin ingin membatalkan pemberian kasbon senilai ${formatIDR(item.amount)}?`
        : `Apakah Anda yakin ingin membatalkan pencairan gaji awal senilai ${formatIDR(item.amount)}?`
      )) {
        await processDelete();
      }
    }
  };

  const handleUpdateGajiParams = async (stafId: string, bonus: number, kasbon: number, catatan: string) => {
    try {
      const stafRef = doc(db, "users", ownerId, "karyawan", stafId);
      const target = karyawanList.find(c => c.id === stafId);
      if (!target) return;
      
      const oldKasbon = target.kasbon || 0;
      const diff = kasbon - oldKasbon;

      await setDoc(stafRef, {
        bonus,
        kasbon,
        catatanGaji: catatan
      }, { merge: true });

      if (diff !== 0) {
        const historyId = "KSB-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
        const histRef = doc(db, "users", ownerId, "kasbon_history", historyId);
        await setDoc(histRef, {
          id: historyId,
          karyawanId: stafId,
          karyawanNama: target.nama,
          tipe: diff > 0 ? "penambahan" : "pengurangan",
          jumlah: Math.abs(diff),
          tanggal: getTodayDateStr(),
          keterangan: `Penyesuaian parameter kasbon oleh Owner (dari Rp ${oldKasbon.toLocaleString()} menjadi Rp ${kasbon.toLocaleString()})`,
          createdAt: new Date().toISOString()
        });
      }

      alert(`Berhasil memperbarui parameter gaji staf ${target.nama}`);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/karyawan/${stafId}`);
    }
  };

  const handleDeductKasbonManual = async (stafId: string, amountToDeduct: number, notes?: string) => {
    if (amountToDeduct <= 0) {
      alert("Jumlah potongan harus lebih besar dari 0.");
      return;
    }
    
    try {
      const target = karyawanList.find(c => c.id === stafId);
      if (!target) return;
      
      const currentKasbon = stafKasbon[stafId] !== undefined ? stafKasbon[stafId] : (target.kasbon || 0);
      if (amountToDeduct > currentKasbon) {
        alert(`Jumlah potongan (Rp ${amountToDeduct.toLocaleString()}) melebihi saldo kasbon saat ini (Rp ${currentKasbon.toLocaleString()}).`);
        return;
      }
      
      const newKasbonVal = Math.max(0, currentKasbon - amountToDeduct);
      
      // Update Firestore karyawan's kasbon field immediately
      const stafRef = doc(db, "users", ownerId, "karyawan", stafId);
      await setDoc(stafRef, { kasbon: newKasbonVal }, { merge: true });
      
      // Keep local input state synchronized
      setStafKasbon(prev => ({ ...prev, [stafId]: newKasbonVal }));
      
      // Set the weekly paycheck deduction state to reduce "TOTAL GAJI NET BARU" on screen!
      setStafKasbonPotong(prev => ({ ...prev, [stafId]: amountToDeduct }));
      
      // Set custom notes for the deduction to be logged upon payroll disbursement
      setStafKasbonPotongNotes(prev => ({ ...prev, [stafId]: notes?.trim() || "" }));
      
      // Mark that this deduction has been immediately applied to the database, so payout won't double-deduct
      setDeductionAppliedToDb(prev => ({ ...prev, [stafId]: true }));

      // Write to kasbon_history
      const historyId = "KSB-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      const histRef = doc(db, "users", ownerId, "kasbon_history", historyId);
      await setDoc(histRef, {
        id: historyId,
        karyawanId: stafId,
        karyawanNama: target.nama,
        tipe: "pengurangan",
        jumlah: amountToDeduct,
        tanggal: getTodayDateStr(),
        keterangan: notes?.trim() || "Pemotongan kasbon manual (otomatis mengurangi total gaji net & saldo tercatat)",
        createdAt: new Date().toISOString()
      });
      
      setActiveDeductKaryawanId(null);
      setDeductKasbonInput("");
      setDeductKasbonNotes("");
      
      alert(`Berhasil memotong saldo kasbon ${target.nama} sebesar Rp ${amountToDeduct.toLocaleString()}.\nSaldo kasbon tercatat berkurang menjadi Rp ${newKasbonVal.toLocaleString()}, dan Total Gaji Net Baru otomatis dikurangi sebesar Rp ${amountToDeduct.toLocaleString()}!`);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/karyawan/${stafId}`);
    }
  };

  const handleDeleteKasbonHistory = async (hist: KasbonHistory) => {
    const isAdd = hist.tipe === "penambahan";
    const actionText = isAdd ? "Pemberian Kasbon" : "Pemotongan / Pelunasan";
    const actionEffect = isAdd 
      ? `mengurangi saldo kasbon sebesar ${formatIDR(hist.jumlah)}`
      : `menambahkan kembali saldo kasbon sebesar ${formatIDR(hist.jumlah)}`;

    const processDeleteHistory = async () => {
      try {
        const targetStaf = karyawanList.find(k => k.id === hist.karyawanId);
        const currentVal = stafKasbon[hist.karyawanId] !== undefined 
          ? stafKasbon[hist.karyawanId] 
          : (targetStaf?.kasbon || 0);

        // Calculate restored kasbon value
        let newKasbonVal = currentVal;
        if (isAdd) {
          // Deleting a "Pemberian Kasbon" (+X) reduces current kasbon by X
          newKasbonVal = Math.max(0, currentVal - hist.jumlah);
        } else {
          // Deleting a "Pemotongan" (-X) increases current kasbon by X
          newKasbonVal = currentVal + hist.jumlah;
        }

        // 1. Delete history doc from Firestore
        await deleteDoc(doc(db, "users", ownerId, "kasbon_history", hist.id));

        // 2. Update employee kasbon field in Firestore
        if (hist.karyawanId) {
          await setDoc(doc(db, "users", ownerId, "karyawan", hist.karyawanId), { kasbon: newKasbonVal }, { merge: true });
          
          // 3. Update local input state
          setStafKasbon(prev => ({ ...prev, [hist.karyawanId]: newKasbonVal }));
        }

        alert("Berhasil menghapus riwayat kasbon dan mengembalikan saldo kasbon ke nominal sebelumnya!");
      } catch (err: any) {
        console.error("Error deleting kasbon history:", err);
        handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/kasbon_history/${hist.id}`);
      }
    };

    if (triggerConfirm) {
      triggerConfirm(
        "HAPUS RIWAYAT KASBON",
        `Apakah Anda yakin ingin menghapus catatan "${actionText}" sebesar ${formatIDR(hist.jumlah)}?\n\nTindakan ini akan otomatis ${actionEffect} (mengembalikan ke nominal sebelum transaksi ini).`,
        processDeleteHistory,
        true,
        "Ya, Hapus & Kembalikan",
        "Batal"
      );
    } else {
      if (window.confirm(`Apakah Anda yakin ingin menghapus catatan "${actionText}" sebesar ${formatIDR(hist.jumlah)}?\n\nTindakan ini akan otomatis ${actionEffect} (mengembalikan ke nominal sebelum transaksi ini).`)) {
        processDeleteHistory();
      }
    }
  };

  const handleAddNewKasbon = async (stafId: string, amount: number, dateStr?: string) => {
    if (isNaN(amount) || amount <= 0) {
      alert("Masukkan nominal penambahan kasbon yang valid.");
      return;
    }
    try {
      const target = karyawanList.find(c => c.id === stafId);
      if (!target) return;
      
      const finalDate = dateStr || getTodayDateStr();

      await onAddExpense({
        title: `Pemberian Kasbon: ${target.nama}`,
        amount: amount,
        category: "Kasbon Karyawan",
        subCategory: "Pemberian Kasbon",
        date: finalDate,
        paymentMethod: "Tunai",
        notes: `Pemberian kasbon untuk staf ${target.nama}.`,
        karyawanId: target.id
      });
      
      const newKasbon = (target.kasbon || 0) + amount;
      // Update local inputs
      setStafKasbon(prev => ({ ...prev, [stafId]: newKasbon }));
      setTambahKasbonInput(prev => ({ ...prev, [stafId]: "" }));
      setTambahKasbonDate(prev => ({ ...prev, [stafId]: "" }));
      alert(`Berhasil menambahkan kasbon ${target.nama} sebesar ${formatIDR(amount)} tanggal ${finalDate}!\nTotal kasbon sekarang: ${formatIDR(newKasbon)}. Transaksi otomatis dicatat di pengeluaran.`);
    } catch (err) {
      console.error(err);
      alert("Gagal menambahkan kasbon: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleAddNewBonus = async (stafId: string, amount: number, dateStr?: string) => {
    if (isNaN(amount) || amount <= 0) {
      alert("Masukkan nominal penambahan bonus yang valid.");
      return;
    }
    try {
      const stafRef = doc(db, "users", ownerId, "karyawan", stafId);
      const target = karyawanList.find(c => c.id === stafId);
      if (!target) return;
      const currentBonus = target.bonus || 0;
      const newBonus = currentBonus + amount;
      
      const finalDate = dateStr || getTodayDateStr();

      // Optionally add a log info to catatanGaji so the owner has a reference
      let updatedCatatan = target.catatanGaji || "";
      const logMsg = `[Bonus +${formatIDR(amount)} tgl ${finalDate}]`;
      if (updatedCatatan) {
        if (!updatedCatatan.includes(logMsg)) {
          updatedCatatan = `${updatedCatatan} ${logMsg}`;
        }
      } else {
        updatedCatatan = logMsg;
      }

      await setDoc(stafRef, {
        bonus: newBonus,
        catatanGaji: updatedCatatan
      }, { merge: true });
      
      // Update local inputs
      setStafBonus(prev => ({ ...prev, [stafId]: newBonus }));
      setStafCatatan(prev => ({ ...prev, [stafId]: updatedCatatan }));
      setTambahBonusInput(prev => ({ ...prev, [stafId]: "" }));
      setTambahBonusDate(prev => ({ ...prev, [stafId]: "" }));
      alert(`Berhasil menambahkan bonus ${target.nama} sebesar ${formatIDR(amount)} tanggal ${finalDate}.\nTotal bonus sekarang: ${formatIDR(newBonus)}.`);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/karyawan/${stafId}`);
    }
  };

  // ✂️ HANDLER POTONGAN GAJI TAMBAHAN (DENGAN KOLOM ALASAN)
  const handleSavePotonganGaji = async (
    karyawanId: string, 
    nominal: number, 
    alasan: string, 
    tanggal: string,
    onSuccess?: () => void
  ) => {
    if (!karyawanId) {
      alert("Harap pilih staf karyawan terlebih dahulu.");
      return;
    }
    if (!nominal || nominal <= 0) {
      alert("Harap masukkan nominal potongan gaji yang valid (lebih besar dari Rp 0).");
      return;
    }
    if (!alasan || !alasan.trim()) {
      alert("Kolom alasan pemotongan gaji wajib diisi agar transparan bagi staf dan owner.");
      return;
    }

    const targetKaryawan = karyawanList.find(k => k.id === karyawanId);
    if (!targetKaryawan) {
      alert("Data karyawan tidak ditemukan.");
      return;
    }

    try {
      const id = "POT-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      const docRef = doc(db, "users", ownerId, "potongan_gaji", id);
      const newRecord: PotonganGaji = {
        id,
        karyawanId: targetKaryawan.id,
        karyawanNama: targetKaryawan.nama,
        jumlah: nominal,
        alasan: alasan.trim(),
        tanggal: tanggal || getTodayDateStr(),
        status: "aktif",
        createdAt: new Date().toISOString()
      };
      await setDoc(docRef, newRecord);
      
      alert(`Berhasil menambahkan potongan gaji sebesar ${formatIDR(nominal)} untuk ${targetKaryawan.nama}.\nAlasan: "${alasan.trim()}".\nStatus: Aktif (Akan otomatis dipotong saat pembayaran gaji).`);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan potongan gaji tambahan.");
    }
  };

  const handleDeletePotonganGaji = (pot: PotonganGaji) => {
    triggerConfirm(
      "HAPUS POTONGAN GAJI",
      `Hapus catatan potongan gaji ${pot.karyawanNama} sebesar ${formatIDR(pot.jumlah)} dengan alasan: "${pot.alasan}"?`,
      async () => {
        try {
          await deleteDoc(doc(db, "users", ownerId, "potongan_gaji", pot.id));
          alert("Catatan potongan gaji berhasil dihapus.");
        } catch (err) {
          console.error(err);
          alert("Gagal menghapus potongan gaji.");
        }
      },
      true,
      "Ya, Hapus",
      "Batal"
    );
  };

  const handleTogglePotonganStatus = async (pot: PotonganGaji) => {
    const nextStatus = pot.status === "aktif" ? "dipotong" : "aktif";
    const statusLabel = nextStatus === "aktif" ? "Aktif (Belum Dipotong)" : "Sudah Dipotong";
    try {
      await updateDoc(doc(db, "users", ownerId, "potongan_gaji", pot.id), {
        status: nextStatus
      });
      alert(`Status potongan gaji ${pot.karyawanNama} diubah menjadi: ${statusLabel}`);
    } catch (err) {
      console.error(err);
      alert("Gagal mengubah status potongan.");
    }
  };

  // Payout process: records salaries as system expenses under "Gaji Karyawan"
  const handleProcessPayroll = (
    k: Karyawan,
    workDays: number,
    totalFood: number,
    kasbonPotong: number,
    overrideBonus?: number,
    overrideKasbon?: number,
    overrideCatatan?: string
  ) => {
    const finalBonus = overrideBonus !== undefined ? overrideBonus : (k.bonus || 0);
    const finalKasbon = overrideKasbon !== undefined ? overrideKasbon : (k.kasbon || 0);
    const finalCatatan = overrideCatatan !== undefined ? overrideCatatan : (k.catatanGaji || "");
    const weeklyBase = k.gajiPokok / 4;
    
    const dateYMD = new Date().toISOString().substring(0, 10);
    const weeklyPeriod = getCurrentGajiPeriod();

    // Calculate dynamic salary withdrawals (Pencairan Gaji) from expenses!
    const pencairanGajiList = (expenses || []).filter(
      (exp) =>
        isExpenseLinkedToStaf(exp, k) &&
        exp.date >= weeklyPeriod.startStr &&
        exp.date <= weeklyPeriod.endStr
    );
    const totalPencairan = pencairanGajiList.reduce((sum, exp) => sum + exp.amount, 0);

    // Calculate active additional deductions for this employee
    const activePotonganStaff = potonganGajiList.filter(
      (p) => p.karyawanId === k.id && p.status === "aktif"
    );
    const totalPotonganTambahan = activePotonganStaff.reduce((sum, p) => sum + p.jumlah, 0);
    const grandTotalDeductions = kasbonPotong + totalPotonganTambahan;

    const totalGaji = weeklyBase + totalFood + finalBonus - grandTotalDeductions - totalPencairan;
    
    let detailsMsg = `Bayar gaji ${k.nama} periode ${weeklyPeriod.formatted} sebesar ${formatIDR(totalGaji)} (Pokok Mingguan: ${formatIDR(weeklyBase)}, Makan: ${formatIDR(totalFood)}, Bonus: ${formatIDR(finalBonus)}`;
    if (totalPencairan > 0) {
      detailsMsg += `, Sudah Dicairkan: -${formatIDR(totalPencairan)}`;
    }
    if (kasbonPotong > 0) {
      detailsMsg += `, Potong Gaji Lainnya: -${formatIDR(kasbonPotong)}`;
    }
    if (totalPotonganTambahan > 0) {
      detailsMsg += `, Potongan Gaji Tambahan (${activePotonganStaff.length} item): -${formatIDR(totalPotonganTambahan)} [${activePotonganStaff.map(p => p.alasan).join("; ")}]`;
    }
    detailsMsg += `, Kehadiran: ${workDays} hari. Saldo Kasbon aktif: ${formatIDR(finalKasbon)}`;
    detailsMsg += `) dan rekam otomatis sebagai pencatatan pengeluaran laundry?`;
    
    triggerConfirm(
      "PROSES & SINKRON GAJI MINGGUAN",
      detailsMsg,
      async () => {
        try {
          const potongNotes = stafKasbonPotongNotes[k.id] || "";
          const potonganTambahanNotes = activePotonganStaff.length > 0 
            ? ` Potongan Gaji Tambahan: -${formatIDR(totalPotonganTambahan)} (Alasan: ${activePotonganStaff.map(p => `${p.alasan} [${formatIDR(p.jumlah)}]`).join("; ")}).` 
            : "";

          await onAddExpense({
            title: `Gaji Mingguan Staf: ${k.nama} (${weeklyPeriod.formatted})`,
            amount: totalGaji,
            category: "Gaji Karyawan",
            subCategory: "Gaji Pokok / Rutin",
            date: dateYMD,
            paymentMethod: "Transfer",
            karyawanId: k.id,
            notes: `Ondemand payroll mingguan otomatis. Pokok Mingguan (1/4): ${formatIDR(weeklyBase)}, Makan: ${formatIDR(totalFood)} (${workDays} hari), Bonus: ${formatIDR(finalBonus)}.` +
                   (kasbonPotong > 0 ? ` Potong Gaji Lainnya: -${formatIDR(kasbonPotong)}.` : "") +
                   potonganTambahanNotes +
                   ` Saldo Kasbon Aktif: ${formatIDR(finalKasbon)}.` +
                   (potongNotes ? ` Keterangan Potongan: ${potongNotes}.` : "") +
                   ` Catatan: ${finalCatatan || "-"}`
          });
          
          // Mark all active additional deductions for this employee as 'dipotong' in Firestore
          if (activePotonganStaff.length > 0) {
            const batch = writeBatch(db);
            activePotonganStaff.forEach((pot) => {
              const potRef = doc(db, "users", ownerId, "potongan_gaji", pot.id);
              batch.update(potRef, {
                status: "dipotong",
                periodeGaji: weeklyPeriod.formatted
              });
            });
            await batch.commit();
          }

          // AUTOMATICALLY DEDUCT MASTER KASBON AND BONUS IN FIRESTORE IF MANUALLY ADJUSTED
          const updateFields: any = {};
          if (finalKasbon !== (k.kasbon || 0)) {
            updateFields.kasbon = finalKasbon;
          }
          if (finalBonus > 0) {
            updateFields.bonus = 0;
          }

          if (Object.keys(updateFields).length > 0) {
            const stafRef = doc(db, "users", ownerId, "karyawan", k.id);
            await setDoc(stafRef, updateFields, { merge: true });
          }

          // Record a history entry if the user manually adjusted the starting kasbon balance in the inputs
          const oldKasbonVal = k.kasbon || 0;
          const manualDiff = finalKasbon - oldKasbonVal;
          if (manualDiff !== 0) {
            const historyId = "KSB-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
            const histRef = doc(db, "users", ownerId, "kasbon_history", historyId);
            await setDoc(histRef, {
              id: historyId,
              karyawanId: k.id,
              karyawanNama: k.nama,
              tipe: manualDiff > 0 ? "penambahan" : "pengurangan",
              jumlah: Math.abs(manualDiff),
              tanggal: dateYMD,
              keterangan: `Penyesuaian manual saldo kasbon saat pembayaran gaji mingguan (${weeklyPeriod.formatted})`,
              createdAt: new Date().toISOString()
            });
          }

          if (kasbonPotong > 0) {
            // Clear local deduction input and notes
            setStafKasbonPotong(prev => ({ ...prev, [k.id]: 0 }));
            setStafKasbonPotongNotes(prev => ({ ...prev, [k.id]: "" }));
          }
          // Reset immediate deduction applied tracker
          setDeductionAppliedToDb(prev => ({ ...prev, [k.id]: false }));
          
          alert(`Berhasil memproses gaji mingguan ${k.nama} dan merekam pengeluaran sebesar ${formatIDR(totalGaji)}!` + 
            (grandTotalDeductions > 0 ? ` (Total potongan: ${formatIDR(grandTotalDeductions)})` : ""));
        } catch (err) {
          console.error(err);
          alert("Gagal mencatat transaksi gaji ke pengeluaran.");
        }
      }
    );
  };

  const downloadSlipGajiForStaf = (
    staf: Karyawan,
    kasbonPotong = 0,
    overrideBonus?: number,
    overrideKasbon?: number,
    overrideCatatan?: string
  ) => {
    const weeklyPeriod = getCurrentGajiPeriod();
    const currentMonth = new Date().toISOString().substring(0, 7); // "YYYY-MM"
    
    // Weekly attendance records (Friday - Thursday)
    const currentWeekAbsensi = absensiList.filter(
      (a) => a.karyawanId === staf.id && a.tanggal >= weeklyPeriod.startStr && a.tanggal <= weeklyPeriod.endStr
    );
    
    // Sisa Kuota Libur (limit is 3 per month)
    const approvedLeavesThisMonth = izinList
      .filter(
        (iz) => iz.karyawanId === staf.id && iz.status === "Disetujui" && (iz.tanggal.startsWith(currentMonth) || (iz.tanggalSelesai && iz.tanggalSelesai.startsWith(currentMonth)))
      )
      .reduce((acc, iz) => acc + (iz.jumlahHari || 1), 0);
    const remainingLeaveQuota = Math.max(0, 3 - approvedLeavesThisMonth);

    const workDaysCount = currentWeekAbsensi.length; // How many times checked in this week period
    const weeklyBaseSalary = staf.gajiPokok / 4;
    const totalFoodAllowance = workDaysCount * staf.uangMakan;
    const bonus = overrideBonus !== undefined ? overrideBonus : (staf.bonus || 0);
    const kasbon = overrideKasbon !== undefined ? overrideKasbon : (staf.kasbon || 0);

    const alreadyApplied = deductionAppliedToDb[staf.id] || false;
    const sisaKasbon = alreadyApplied ? kasbon : Math.max(0, kasbon - kasbonPotong);

    // Calculate dynamic salary withdrawals (Pencairan Gaji) from expenses!
    const pencairanGajiList = (expenses || []).filter(
      (exp) =>
        isExpenseLinkedToStaf(exp, staf) &&
        exp.date >= weeklyPeriod.startStr &&
        exp.date <= weeklyPeriod.endStr
    );
    const totalPencairan = pencairanGajiList.reduce((sum, exp) => sum + exp.amount, 0);

    // Active additional deductions with reasons
    const activePotonganStaff = potonganGajiList.filter(
      (p) => p.karyawanId === staf.id && p.status === "aktif"
    );
    const totalPotonganTambahan = activePotonganStaff.reduce((sum, p) => sum + p.jumlah, 0);
    const grandTotalDeductions = kasbonPotong + totalPotonganTambahan;

    const totalPayout = weeklyBaseSalary + totalFoodAllowance + bonus - grandTotalDeductions - totalPencairan;

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

    // Row 4: Potongan Gaji Tambahan & Kasbon
    nextY = nextY + 10;
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(8.5);
    docPdf.setTextColor(24, 24, 27);
    docPdf.text("4. Potongan Gaji Tambahan", 18, nextY);

    if (grandTotalDeductions > 0) {
      docPdf.setTextColor(185, 28, 28); // red color
      docPdf.setFont("helvetica", "bold");
      docPdf.text(`- ${formatIDR(grandTotalDeductions)}`, 192, nextY, { align: "right" });
    } else {
      docPdf.setTextColor(113, 113, 122);
      docPdf.setFont("helvetica", "bold");
      docPdf.text(`- ${formatIDR(0)}`, 192, nextY, { align: "right" });
    }

    // Detail Alasan / Keterangan dibuat ke baris bawah agar tidak bertabrakan dan dapat dibaca penuh
    if (activePotonganStaff.length > 0) {
      activePotonganStaff.forEach((p, idx) => {
        nextY = nextY + 4.5;
        docPdf.setFont("helvetica", "normal");
        docPdf.setFontSize(7.5);
        docPdf.setTextColor(185, 28, 28);
        const prefix = activePotonganStaff.length > 1 ? `• Alasan ${idx + 1}: ` : "• Alasan: ";
        const reasonLines: string[] = docPdf.splitTextToSize(`${prefix}${p.alasan}`, 135);
        docPdf.text(reasonLines, 22, nextY);
        docPdf.setTextColor(113, 113, 122);
        docPdf.text(`(${formatIDR(p.jumlah)})`, 192, nextY, { align: "right" });
        if (reasonLines.length > 1) {
          nextY = nextY + (reasonLines.length - 1) * 3.5;
        }
      });
      if (kasbonPotong > 0) {
        nextY = nextY + 4.5;
        docPdf.setFont("helvetica", "normal");
        docPdf.setFontSize(7.5);
        docPdf.setTextColor(113, 113, 122);
        const kbNote = stafKasbonPotongNotes[staf.id] 
          ? `• Potongan Lain: ${stafKasbonPotongNotes[staf.id]}` 
          : "• Potongan kasbon / uang makan";
        const kbLines: string[] = docPdf.splitTextToSize(kbNote, 135);
        docPdf.text(kbLines, 22, nextY);
        docPdf.text(`(${formatIDR(kasbonPotong)})`, 192, nextY, { align: "right" });
        if (kbLines.length > 1) {
          nextY = nextY + (kbLines.length - 1) * 3.5;
        }
      }
    } else if (kasbonPotong > 0) {
      nextY = nextY + 4.5;
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(7.5);
      docPdf.setTextColor(113, 113, 122);
      const kbNote = stafKasbonPotongNotes[staf.id] 
        ? `• Keterangan: ${stafKasbonPotongNotes[staf.id]}` 
        : "• Keterangan: Dipotong dari uang makan / kasbon";
      const kbLines: string[] = docPdf.splitTextToSize(kbNote, 165);
      docPdf.text(kbLines, 22, nextY);
      if (kbLines.length > 1) {
        nextY = nextY + (kbLines.length - 1) * 3.5;
      }
    } else {
      nextY = nextY + 4.5;
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(7.5);
      docPdf.setTextColor(113, 113, 122);
      docPdf.text("• Keterangan: Dipotong dari uang makan / gaji", 22, nextY);
    }

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

    // Simple zebra line
    docPdf.setDrawColor(244, 244, 245); // zinc-100
    docPdf.line(15, nextY + 4, 195, nextY + 4);

    // Row 6: Kasbon Pegawai (Info Saldo)
    nextY = nextY + 10;
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(8.5);
    docPdf.setTextColor(24, 24, 27);
    docPdf.text("6. Kasbon Pegawai (Info)", 18, nextY);
    docPdf.setTextColor(113, 113, 122);
    docPdf.text("Saldo aktif (kasbon)", 110, nextY);
    docPdf.setTextColor(217, 119, 6); // amber color
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`${formatIDR(sisaKasbon)}`, 192, nextY, { align: "right" });

    // Row 7: dynamic salary withdrawals (Pencairan Gaji Awal / Uang Muka)
    if (totalPencairan > 0) {
      // Simple zebra line
      docPdf.setDrawColor(244, 244, 245); // zinc-100
      docPdf.line(15, nextY + 4, 195, nextY + 4);

      nextY = nextY + 10;
      docPdf.setFont("helvetica", "normal");
      docPdf.setTextColor(24, 24, 27);
      docPdf.text("7. Pencairan Gaji Awal (Uang Muka)", 18, nextY);
      docPdf.setTextColor(113, 113, 122);
      docPdf.text(`Pencairan gaji instan selama periode aktif`, 110, nextY);
      docPdf.setTextColor(185, 28, 28); // red color
      docPdf.setFont("helvetica", "bold");
      docPdf.text(`- ${formatIDR(totalPencairan)}`, 192, nextY, { align: "right" });
    }

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
    const activeCatatan = overrideCatatan !== undefined ? overrideCatatan : (staf.catatanGaji || "");
    if (activeCatatan && activeCatatan.trim()) {
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
      docPdf.text(activeCatatan.substring(0, 95), 18, nextY + 9.5);
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

  const downloadHistoricSlipGaji = (exp: Expense, staf: Karyawan) => {
    const docPdf = new jsPDF("p", "mm", "a4");

    // Header Banner
    docPdf.setFillColor(16, 124, 65); // Emerald green
    docPdf.rect(0, 0, 210, 32, "F");

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(16);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text("SLIP BUKTI PENCAIRAN GAJI KARYAWAN", 15, 15);

    docPdf.setFontSize(10);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(`Laporan Riwayat Gajian Sah - ${locationConfig.namaLokasi || "Laundry Management"}`, 15, 23);

    // Metadata Box
    docPdf.setDrawColor(228, 228, 231);
    docPdf.rect(15, 38, 180, 32, "S");

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9.5);
    docPdf.setTextColor(24, 24, 27);
    docPdf.text("DATA PENERIMA GAJI:", 20, 46);
    docPdf.text("DETAIL TRANSAKSI GAJI:", 110, 46);

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9);
    docPdf.setTextColor(71, 85, 105);
    docPdf.text(`Nama: ${staf.nama}`, 20, 53);
    docPdf.text(`ID Staf: ${staf.id}`, 20, 60);

    docPdf.text(`Tanggal Payout: ${exp.date}`, 110, 53);
    docPdf.text(`Metode Bayar: ${exp.paymentMethod || "Transfer"}`, 110, 60);

    // Table
    const startY = 78;
    docPdf.setFillColor(244, 244, 245);
    docPdf.rect(15, startY, 180, 8, "F");

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9);
    docPdf.setTextColor(82, 82, 91);
    docPdf.text("DESKRIPSI SLIP GAJI & RINCIAN POTONGAN", 20, startY + 5.5);
    docPdf.text("NOMINAL NET (IDR)", 190, startY + 5.5, { align: "right" });

    docPdf.setFont("helvetica", "normal");
    docPdf.setTextColor(24, 24, 27);
    docPdf.text(exp.title || "Pembayaran Gaji Karyawan", 20, startY + 16);
    docPdf.setFont("helvetica", "bold");
    docPdf.text(formatIDR(exp.amount), 190, startY + 16, { align: "right" });

    if (exp.notes) {
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(8.5);
      docPdf.setTextColor(100, 116, 139);
      const splitNotes = docPdf.splitTextToSize(`Catatan: ${exp.notes}`, 170);
      docPdf.text(splitNotes, 20, startY + 24);
    }

    // Grand Total Box
    const totalY = startY + 45;
    docPdf.setFillColor(236, 253, 245);
    docPdf.rect(15, totalY, 180, 12, "F");
    docPdf.setDrawColor(16, 185, 129);
    docPdf.rect(15, totalY, 180, 12, "S");

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(11);
    docPdf.setTextColor(6, 95, 70);
    docPdf.text("TOTAL GAJI NET DITERIMA:", 20, totalY + 8);
    docPdf.text(formatIDR(exp.amount), 190, totalY + 8, { align: "right" });

    // Signatures
    const sigY = totalY + 25;
    docPdf.setFontSize(9);
    docPdf.setFont("helvetica", "normal");
    docPdf.setTextColor(100, 116, 139);
    docPdf.text("Penerima Gaji (Staf),", 30, sigY);
    docPdf.text("Manajemen Laundry (Owner),", 130, sigY);

    docPdf.setFont("helvetica", "bold");
    docPdf.setTextColor(24, 24, 27);
    docPdf.text(staf.nama, 30, sigY + 20);
    docPdf.text("Manajemen / Owner", 130, sigY + 20);

    docPdf.save(`Slip_Gaji_${staf.nama.replace(/\s+/g, "_")}_${exp.date}.pdf`);
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
    const endTgl = iz.tanggalSelesai || iz.tanggal;
    if (izinStartDate && endTgl < izinStartDate) return false;
    if (izinEndDate && iz.tanggal > izinEndDate) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans">
      
      {/* Tab bar header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-0.5 bg-[#121214] p-1 border-b border-[#27272A] shrink-0 text-center text-xs uppercase font-black tracking-normal">
        <button
          onClick={() => setPanelTab("karyawan")}
          className={`py-2 px-1 cursor-pointer transition-all ${
            panelTab === "karyawan" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          Data Staf
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
          Pengaturan Outlet
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
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          
           {/* TAB 1: KARYAWAN (CRUD REGISTER) */}
          {panelTab === "karyawan" && (
            <div className="space-y-4">
              
              {/* Segmented control for Staf vs Admin credentials */}
              <div className="grid grid-cols-2 gap-1 bg-[#121214] p-1 border border-[#27272A] shrink-0 font-extrabold uppercase text-[13px]">
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
                  <form id="form-edit-karyawan" onSubmit={handleSaveKaryawan} className="bg-[#121214] border border-[#27272A] p-4 space-y-3 text-left scroll-mt-6">
                    <h4 className="text-[13px] font-black text-emerald-500 uppercase tracking-wider border-b border-[#27272A] pb-2">
                       {isEditingKaryawan ? "MODIFIKASI DETAIL STAF/KARYAWAN" : "REGISTER AKUN KARYAWAN BARU"}
                    </h4>
                    
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Nama Lengkap Karyawan</label>
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
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Username Login</label>
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
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Password Login</label>
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

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-400" />
                            <span>Nomor WhatsApp (Untuk Reminder Shift)</span>
                          </label>
                          <input
                            type="tel"
                            placeholder="Contoh: 08123456789"
                            value={karyawanTelepon}
                            onChange={(e) => setKaryawanTelepon(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">
                            Jadwal Shift Awal / Saat Ini
                          </label>
                          <select
                            value={karyawanCurrentShift}
                            onChange={(e) => setKaryawanCurrentShift(e.target.value as ShiftType)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs font-mono"
                          >
                            <option value="pagi">🌅 Shift Pagi (07.30 - 18.00 WIB)</option>
                            <option value="siang">☀️ Shift Siang (11.00 - 21.00 WIB)</option>
                            <option value="tidak_ada">🚫 Tidak Ada Shift (Libur / Bebas Tugas)</option>
                          </select>
                        </div>
                      </div>

                      <div className="bg-zinc-950/70 p-2.5 border border-zinc-800 flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={karyawanAutoRolling}
                            onChange={(e) => setKaryawanAutoRolling(e.target.checked)}
                            className="rounded-none border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                          />
                          <span className="text-xs font-bold text-zinc-300">
                            Aktifkan Rolling Shift Otomatis (Berganti Pagi ↔ Siang setiap hari Senin)
                          </span>
                        </label>
                        <span className="text-[10px] font-mono text-emerald-400 hidden sm:inline-block">
                          {karyawanAutoRolling ? "Aktif (Otomatis)" : "Nonaktif (Tetap)"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Gaji Pokok Utama (Rp)</label>
                          <input
                            type="number"
                            required
                            value={karyawanGaji}
                            onChange={(e) => setKaryawanGaji(Number(e.target.value))}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Uang Makan / Hari (Rp)</label>
                          <input
                            type="number"
                            required
                            value={karyawanMakan}
                            onChange={(e) => setKaryawanMakan(Number(e.target.value))}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Bonus Insentif (Rp) - Opsional</label>
                          <input
                            type="number"
                            value={karyawanBonus}
                            onChange={(e) => setKaryawanBonus(Number(e.target.value))}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Saldo Kasbon (Rp) - Opsional</label>
                          <input
                            type="number"
                            value={karyawanKasbon}
                            onChange={(e) => setKaryawanKasbon(Number(e.target.value))}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none font-mono text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Catatan Slip Gaji (Opsional)</label>
                        <input
                          type="text"
                          placeholder="Misal: Bonus lembur proyek, Potongan kasbon awal bulan"
                          value={karyawanCatatanGaji}
                          onChange={(e) => setKaryawanCatatanGaji(e.target.value)}
                          className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-[13px] tracking-widest rounded-none transition-all cursor-pointer"
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
                            setKaryawanBonus(0);
                            setKaryawanKasbon(0);
                            setKaryawanCatatanGaji("");
                          }}
                          className="px-3 py-2.5 bg-zinc-950 border border-zinc-900 text-zinc-400 font-extrabold text-[13px] uppercase cursor-pointer"
                        >
                          Batal
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Laundry ID Info Card block */}
                  <div className="bg-[#121214] border border-emerald-900/30 p-3 flex flex-col gap-2 relative overflow-hidden text-left">
                    <span className="text-[11px] font-mono leading-none text-emerald-400 bg-emerald-950 px-2 py-1 w-max font-black tracking-widest uppercase">
                      🔐 ID KODE OUTLET (LAUNDRY ID)
                    </span>
                    <p className="text-[13px] text-zinc-300 font-bold leading-normal mt-1">
                      Bagikan ID berikut kepada staf Anda untuk login di HP/PWA mereka:
                    </p>
                    <div className="bg-zinc-950 p-2 border border-zinc-900 font-mono text-xs font-black select-all text-white text-center tracking-wider max-w-sm">
                      {ownerId}
                    </div>
                  </div>

                  {/* Daftar Karyawan List */}
                  <div className="bg-[#121214] border border-[#27272A] p-4 text-left">
                    <h4 className="text-[13px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3">
                      STAF LAUNDRY TERDAFTAR ({karyawanList.length})
                    </h4>

                    <div className="space-y-2">
                      {karyawanList.length === 0 ? (
                        <p className="text-[12px] text-zinc-400 text-center italic py-4">Belum ada staf karyawan yang didaftarkan.</p>
                      ) : (
                        karyawanList.map((k) => {
                          const isSelectedForEdit = isEditingKaryawan && editKaryawanId === k.id;
                          return (
                            <div 
                              key={k.id} 
                              className={`bg-[#0A0A0B] p-3.5 flex items-center justify-between border transition-all duration-300 ${
                                isSelectedForEdit 
                                  ? "border-amber-500 shadow-lg ring-1 ring-amber-500/20 bg-[#161619]" 
                                  : "border-zinc-950"
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h5 className="font-black text-sm text-white uppercase tracking-tight">{k.nama}</h5>
                                  <span className={`text-[9.5px] font-black uppercase px-1.5 py-0.5 border font-mono ${
                                    k.currentShift === "tidak_ada"
                                      ? "bg-zinc-900/90 text-zinc-400 border-zinc-700"
                                      : k.currentShift === "siang"
                                        ? "bg-amber-950/60 text-amber-400 border-amber-900/60"
                                        : "bg-emerald-950/60 text-emerald-400 border-emerald-900/60"
                                  }`}>
                                    {k.currentShift === "tidak_ada" ? "🚫 Tidak Ada Shift (Libur)" : k.currentShift === "siang" ? "☀️ Shift Siang" : "🌅 Shift Pagi"}
                                  </span>
                                  {k.currentShift !== "tidak_ada" && (
                                    <span className={`text-[8.5px] font-mono px-1.5 py-0.5 border ${
                                      k.autoRollingShift === false
                                        ? "bg-zinc-900/80 text-zinc-400 border-zinc-800"
                                        : "bg-cyan-950/40 text-cyan-400 border-cyan-900/40"
                                    }`}>
                                      {k.autoRollingShift === false ? "Tetap" : "Rolling Senin"}
                                    </span>
                                  )}
                                  {k.telepon && (
                                    <span className="text-[9.5px] text-zinc-400 font-mono flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5">
                                      <Phone className="w-2.5 h-2.5 text-emerald-400" />
                                      {k.telepon}
                                    </span>
                                  )}
                                  {isSelectedForEdit && (
                                    <span className="text-[10px] bg-amber-950 text-amber-400 border border-amber-900 px-1.5 py-0.5 font-bold uppercase tracking-wider scale-95 origin-left">
                                      Sedang Diedit
                                    </span>
                                  )}
                                </div>
                                <div className="text-[12px] text-zinc-450 font-mono space-y-1">
                                  <p>Username: <strong className="text-zinc-200 font-semibold">{k.username}</strong> | Pass: <strong className="text-zinc-200 font-semibold">{k.password}</strong></p>
                                  <p>Pokok: <span className="text-emerald-400">{formatIDR(k.gajiPokok)}</span> | Makan/Hari: <span className="text-emerald-400">{formatIDR(k.uangMakan)}</span></p>
                                  {(k.bonus || k.kasbon) ? (
                                    <p>
                                      {k.bonus ? <span>Bonus: <strong className="text-emerald-450">{formatIDR(k.bonus)}</strong></span> : null}
                                      {k.bonus && k.kasbon ? <span className="mx-1">|</span> : null}
                                      {k.kasbon ? <span>Kasbon: <strong className="text-rose-400">{formatIDR(k.kasbon)}</strong></span> : null}
                                    </p>
                                  ) : null}
                                  {k.catatanGaji ? <p className="text-[11px] text-zinc-300 italic">Catatan: {k.catatanGaji}</p> : null}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 font-sans">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInputPotonganKaryawanId(k.id);
                                    setPotonganStaffFilter(k.id);
                                    setPanelTab("gaji");
                                    setGajiSubTab("potongan");
                                  }}
                                  className="bg-zinc-950 border border-[#27272A] hover:border-rose-500 text-zinc-400 hover:text-rose-400 p-1.5 transition-all cursor-pointer rounded-mono"
                                  title="Potongan Gaji Tambahan (Alasan)"
                                >
                                  <Scissors className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveHistoryKaryawanId(k.id)}
                                  className="bg-zinc-950 border border-[#27272A] hover:border-amber-500 text-zinc-400 hover:text-amber-400 p-1.5 transition-all cursor-pointer rounded-mono"
                                  title="Lihat & Unduh Riwayat Kasbon"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
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
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Form Input / Edit Admin */}
                  <form onSubmit={handleSaveAdmin} className="bg-[#121214] border border-[#27272A] p-4 space-y-3 text-left">
                    <h4 className="text-[13px] font-black text-emerald-500 uppercase tracking-wider border-b border-[#27272A] pb-2">
                      {isEditingAdmin ? "MODIFIKASI DETAIL ADMIN" : "REGISTER AKUN ADMIN BARU"}
                    </h4>
                    
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Nama Lengkap Admin</label>
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
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Username Login</label>
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
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Password Login</label>
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
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-[13px] tracking-widest rounded-none transition-all cursor-pointer"
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
                    <span className="text-[11px] font-mono leading-none text-emerald-400 bg-emerald-950 px-2 py-1 w-max font-black tracking-widest uppercase">
                      🔐 ID KODE OUTLET (LAUNDRY ID)
                    </span>
                    <p className="text-[13px] text-zinc-300 font-bold leading-normal mt-1">
                      Bagikan ID berikut kepada pengelola admin untuk login di perangkat mereka:
                    </p>
                    <div className="bg-zinc-950 p-2 border border-zinc-900 font-mono text-xs font-black select-all text-white text-center tracking-wider max-w-sm">
                      {ownerId}
                    </div>
                  </div>

                  {/* Daftar Admin List */}
                  <div className="bg-[#121214] border border-[#27272A] p-4 text-left">
                    <h4 className="text-[13px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3">
                      ADMIN LAUNDRY TERDAFTAR ({adminList.length})
                    </h4>

                    <div className="space-y-2">
                      {adminList.length === 0 ? (
                        <p className="text-[12px] text-zinc-400 text-center italic py-4">Belum ada akun admin pengelola yang didaftarkan.</p>
                      ) : (
                        adminList.map((a) => (
                          <div key={a.id} className="bg-[#0A0A0B] border border-zinc-950 p-3.5 flex items-center justify-between">
                            <div className="space-y-1">
                              <h5 className="font-black text-sm text-white uppercase tracking-tight">{a.nama}</h5>
                              <div className="text-[12px] text-zinc-450 font-mono space-y-1">
                                <p>Username: <strong className="text-zinc-250 font-semibold">{a.username}</strong> | Pass: <strong className="text-zinc-250 font-semibold">{a.password}</strong></p>
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
              
              {/* Sub-tab navigation: Log Presensi vs Riwayat Shift */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 bg-[#121214] p-1 border border-[#27272A] text-xs font-black uppercase font-mono">
                <button
                  onClick={() => setAbsenSubTab("log")}
                  className={`py-2.5 px-3 flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    absenSubTab === "log"
                      ? "bg-emerald-500 text-black shadow-xs"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <CalendarCheck className="w-4 h-4" />
                  <span>Log Presensi Harian</span>
                </button>
                <button
                  onClick={() => setAbsenSubTab("shift")}
                  className={`py-2.5 px-3 flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    absenSubTab === "shift"
                      ? "bg-emerald-500 text-black shadow-xs"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Riwayat Shift (Minggu & Bulan Lewat)</span>
                </button>
              </div>

              {absenSubTab === "shift" ? (
                <ShiftHistoryView
                  ownerId={ownerId}
                  karyawanList={karyawanList}
                  absensiList={absensiList}
                  izinList={izinList}
                />
              ) : (
                <>
              {/* Filter and export actions */}
              <div className="bg-[#121214] border border-[#27272A] p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[13px] font-black text-[#A1A1AA] uppercase tracking-wider flex items-center gap-1 font-sans">
                    <Users className="text-emerald-500 w-4 h-4" /> Filter Log & Ekspor
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowManualAbsen(!showManualAbsen);
                        if (!showManualAbsen) {
                          setManualAbsenStaffId("");
                          setManualAbsenDate(getYesterdayYMD());
                          setManualAbsenStatus("Hadir");
                          setManualAbsenCheckIn("08:00");
                          setManualAbsenCheckOut("17:00");
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black font-sans text-[12px] uppercase cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showManualAbsen ? "Tutup Form" : "Absen Manual"}</span>
                    </button>

                    <button
                      onClick={handleExportAbsensiCSV}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black font-sans text-[12px] uppercase cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Pilih Karyawan</label>
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
                    <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Mulai Tanggal</label>
                    <input
                      type="date"
                      value={absensiStartDate}
                      onChange={(e) => setAbsensiStartDate(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-xs rounded-none font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Sampai Tanggal</label>
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
                  <span className="text-[11px] font-black text-[#A1A1AA] uppercase tracking-wider self-center mr-1">Pintasan Periode:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const todayStr = new Date().toISOString().substring(0, 10);
                      setAbsensiStartDate(todayStr);
                      setAbsensiEndDate(todayStr);
                    }}
                    className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-350 hover:text-white px-2.5 py-1.5 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
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
                    className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-350 hover:text-white px-2.5 py-1.5 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
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
                    className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-350 hover:text-white px-2.5 py-1.5 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    Bulan Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAbsensiStartDate("");
                      setAbsensiEndDate("");
                    }}
                    className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-350 hover:text-white px-2.5 py-1.5 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    Tampilkan Semua
                  </button>
                </div>
              </div>

              {/* Form Absen Manual */}
              {showManualAbsen && (() => {
                const targetDatesPreview = manualAbsenMode === "range" 
                  ? getDatesInRange(manualAbsenDate, manualAbsenEndDate, manualAbsenExcludeSunday) 
                  : (manualAbsenDate ? [manualAbsenDate] : []);

                return (
                  <div className="bg-[#121214] border border-amber-900/50 p-4 text-left space-y-4 animate-fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#27272A] pb-2 gap-2">
                      <h4 className="text-[13px] font-black text-amber-500 uppercase tracking-wider">
                        Form Perekaman Absensi Manual Karyawan
                      </h4>
                      <span className="text-[11px] text-zinc-400 font-mono">
                        Mode: <strong className="text-white uppercase">{manualAbsenMode === "range" ? "Rentang Waktu (Bulk)" : "Tanggal Tunggal"}</strong>
                      </span>
                    </div>

                    {/* Mode Selector Tabs */}
                    <div className="grid grid-cols-2 bg-[#0A0A0B] p-1 border border-[#27272A] gap-1">
                      <button
                        type="button"
                        onClick={() => setManualAbsenMode("single")}
                        className={`py-2 px-3 text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-2 ${
                          manualAbsenMode === "single"
                            ? "bg-amber-500 text-black shadow font-extrabold"
                            : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                        }`}
                      >
                        <span>📅</span>
                        <span>Input 1 Hari Saja</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setManualAbsenMode("range");
                          if (!manualAbsenEndDate) setManualAbsenEndDate(manualAbsenDate);
                        }}
                        className={`py-2 px-3 text-xs font-black uppercase transition cursor-pointer flex items-center justify-center gap-2 ${
                          manualAbsenMode === "range"
                            ? "bg-amber-500 text-black shadow font-extrabold"
                            : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                        }`}
                      >
                        <span>🗓️</span>
                        <span>Input Range Waktu / Rentang Tanggal</span>
                      </button>
                    </div>
                    
                    <form onSubmit={handleSaveManualAbsen} className="space-y-4 text-xs font-sans">
                      {/* Pilih Karyawan */}
                      <div>
                        <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">
                          Pilih Karyawan <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          value={manualAbsenStaffId}
                          onChange={(e) => setManualAbsenStaffId(e.target.value)}
                          className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-amber-500 rounded-none text-xs font-bold"
                        >
                          <option value="">-- PILIH STAF KARYAWAN --</option>
                          {karyawanList.map((st) => (
                            <option key={st.id} value={st.id}>{st.nama}</option>
                          ))}
                        </select>
                      </div>

                      {/* Mode Single vs Range Date Inputs */}
                      {manualAbsenMode === "single" ? (
                        <div>
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">
                            Tanggal Absen <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="date"
                            required
                            value={manualAbsenDate}
                            onChange={(e) => setManualAbsenDate(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-amber-500 rounded-none font-mono text-xs font-extrabold"
                          />
                          <div className="flex gap-1.5 mt-1">
                            <button
                              type="button"
                              onClick={() => setManualAbsenDate(getYesterdayYMD())}
                              className="text-[11px] font-bold text-amber-500 hover:text-amber-400 font-sans cursor-pointer uppercase underline"
                            >
                              Set Hari Kemarin
                            </button>
                            <span className="text-zinc-650 text-[11px] font-sans">|</span>
                            <button
                              type="button"
                              onClick={() => setManualAbsenDate(new Date().toISOString().substring(0, 10))}
                              className="text-[11px] font-bold text-zinc-400 hover:text-white font-sans cursor-pointer uppercase underline"
                            >
                              Set Hari Ini
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 bg-[#0A0A0B] p-3.5 border border-amber-900/30">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Tanggal Awal */}
                            <div>
                              <label className="text-[12px] font-black uppercase text-amber-400 block mb-1.5">
                                Tanggal Awal (Mulai) <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="date"
                                required
                                value={manualAbsenDate}
                                onChange={(e) => setManualAbsenDate(e.target.value)}
                                className="w-full bg-[#121214] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-amber-500 rounded-none font-mono text-xs font-extrabold"
                              />
                            </div>

                            {/* Tanggal Akhir */}
                            <div>
                              <label className="text-[12px] font-black uppercase text-amber-400 block mb-1.5">
                                Tanggal Akhir (Sampai) <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="date"
                                required
                                value={manualAbsenEndDate}
                                onChange={(e) => setManualAbsenEndDate(e.target.value)}
                                min={manualAbsenDate}
                                className="w-full bg-[#121214] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-amber-500 rounded-none font-mono text-xs font-extrabold"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#27272A]/40 text-[11px]">
                            <label className="flex items-center gap-2 text-zinc-300 font-bold cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={manualAbsenExcludeSunday}
                                onChange={(e) => setManualAbsenExcludeSunday(e.target.checked)}
                                className="accent-amber-500 w-4 h-4 rounded-none cursor-pointer"
                              />
                              <span>Lewati Hari Minggu (Jika Libur Rutin)</span>
                            </label>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const now = new Date();
                                  const sevenDaysAgo = new Date();
                                  sevenDaysAgo.setDate(now.getDate() - 6);
                                  setManualAbsenDate(sevenDaysAgo.toISOString().substring(0, 10));
                                  setManualAbsenEndDate(now.toISOString().substring(0, 10));
                                }}
                                className="text-amber-500 hover:text-amber-400 underline font-bold uppercase"
                              >
                                7 Hari Terakhir
                              </button>
                              <span className="text-zinc-700">|</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const now = new Date();
                                  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                                  setManualAbsenDate(firstDay.toISOString().substring(0, 10));
                                  setManualAbsenEndDate(now.toISOString().substring(0, 10));
                                }}
                                className="text-zinc-400 hover:text-white underline font-bold uppercase"
                              >
                                Awal Bulan s/d Hari Ini
                              </button>
                            </div>
                          </div>

                          {/* Preview Total & Dates */}
                          <div className="bg-[#121214] border border-zinc-800 p-2.5 rounded-none space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-zinc-400">Total Log Yang Akan Dibuat:</span>
                              <span className="text-amber-400 font-mono text-[13px] font-black">
                                {targetDatesPreview.length} Hari Kehadiran
                              </span>
                            </div>

                            {targetDatesPreview.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                                {targetDatesPreview.map((dStr) => {
                                  const dt = new Date(dStr);
                                  const dayName = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][dt.getDay()];
                                  return (
                                    <span key={dStr} className="bg-zinc-900 border border-zinc-700 text-zinc-300 px-1.5 py-0.5 text-[10px] font-mono">
                                      {dayName}, {dStr}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[11px] text-rose-400 italic">
                                Tanggal akhir harus sama atau setelah tanggal awal.
                              </p>
                            )}

                            <p className="text-[10px] text-zinc-450 italic leading-snug">
                              * Catatan: Sistem akan otomatis membuat 1 log kehadiran per tanggal secara berurutan pada riwayat absensi, sehingga uang makan dan statistik kehadiran tercatat akurat setiap hari.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Status */}
                        <div>
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">
                            Status Kehadiran
                          </label>
                          <select
                            value={manualAbsenStatus}
                            onChange={(e) => setManualAbsenStatus(e.target.value as "Hadir" | "Terlambat")}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-amber-500 rounded-none text-xs font-bold"
                          >
                            <option value="Hadir">HADIR (TEPAT WAKTU)</option>
                            <option value="Terlambat">TERLAMBAT</option>
                          </select>
                        </div>

                        {/* Jam Masuk */}
                        <div>
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">
                            Jam Masuk (Check-In) <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="time"
                            required
                            value={manualAbsenCheckIn}
                            onChange={(e) => setManualAbsenCheckIn(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-amber-500 rounded-none font-mono text-xs font-bold"
                          />
                        </div>

                        {/* Jam Pulang */}
                        <div>
                          <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">
                            Jam Pulang (Check-Out) <span className="text-zinc-500">(Opsional)</span>
                          </label>
                          <input
                            type="time"
                            value={manualAbsenCheckOut}
                            onChange={(e) => setManualAbsenCheckOut(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-amber-500 rounded-none font-mono text-xs font-bold"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-2 border-t border-[#27272A]/50">
                        <button
                          type="button"
                          onClick={() => setShowManualAbsen(false)}
                          disabled={manualAbsenSubmitting}
                          className="px-4 py-2 border border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-white text-[12px] font-black uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={manualAbsenSubmitting || (manualAbsenMode === "range" && targetDatesPreview.length === 0)}
                          className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-black uppercase tracking-wider transition cursor-pointer active:scale-95 border-none rounded-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {manualAbsenSubmitting ? (
                            <span>Menyimpan Log Absensi...</span>
                          ) : manualAbsenMode === "range" ? (
                            <span>Simpan Sekaligus ({targetDatesPreview.length} Hari)</span>
                          ) : (
                            <span>Simpan Absensi Manual</span>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                );
              })()}

              {/* Attendance Table logs representation */}
              <div className="bg-[#121214] border border-[#27272A] p-4">
                <h4 className="text-[13px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3">
                  Log Riwayat Kehadiran Terbaru ({filteredAbsensi.length})
                </h4>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {filteredAbsensi.length === 0 ? (
                    <p className="text-[12px] text-zinc-450 text-center italic py-6">Tidak menemukan log absensi karyawan.</p>
                  ) : (
                    filteredAbsensi.map((ab) => {
                      const checkIn = new Date(ab.checkInTime);
                      const checkOut = ab.checkOutTime ? new Date(ab.checkOutTime) : null;
                      return (
                        <div key={ab.id} className="bg-[#0A0A0B] border border-zinc-950 p-3.5 space-y-2 font-mono text-[12px] relative leading-normal">
                          <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5 font-sans">
                            <div>
                              <span className="font-extrabold text-white uppercase text-[13px] block">{ab.nama}</span>
                              <span className="text-[11px] text-zinc-400 font-mono">Tanggal: {ab.tanggal}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[11px] font-black uppercase px-2 py-0.5 border ${
                                ab.status === "Hadir"
                                  ? "bg-emerald-950/20 border-emerald-900/30 text-emerald-400"
                                  : "bg-amber-950/20 border-amber-850/30 text-amber-500"
                              }`}>
                                {ab.status}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteAbsensi(ab.id, ab.nama, ab.tanggal)}
                                className="p-1 hover:bg-rose-950/30 text-zinc-500 hover:text-rose-400 rounded-xs transition cursor-pointer"
                                title="Hapus Data Absensi"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[12px] font-semibold text-zinc-300">
                            <div>
                              <span className="font-sans font-black text-[11px] text-zinc-450 uppercase block mb-0.5">Masuk Kerja</span>
                              <p className="text-white font-mono">{checkIn.toLocaleTimeString("id-ID", { timeStyle: "medium" })}</p>
                              <p className="text-[11px] text-zinc-400">Jarak: {ab.distanceIn ? `${ab.distanceIn}m` : "-"}</p>
                            </div>
                            <div>
                              <span className="font-sans font-black text-[11px] text-zinc-455 uppercase block mb-0.5">Pulang Kerja</span>
                              <p className="text-white font-mono">
                                {checkOut ? checkOut.toLocaleTimeString("id-ID", { timeStyle: "medium" }) : "Aktif Kerja"}
                              </p>
                              {ab.distanceOut && <p className="text-[11px] text-zinc-400">Jarak: {ab.distanceOut}m</p>}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              </>
              )}
            </div>
          )}

          {/* TAB 3: LEAVE PERMISSION MODERATION */}
          {panelTab === "izin" && (
            <div className="space-y-4 text-left font-sans">
              
              <div className="bg-[#121214] border border-[#27272A] p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Pilih Karyawan</label>
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
                    <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Mulai Tanggal</label>
                    <input
                      type="date"
                      value={izinStartDate}
                      onChange={(e) => setIzinStartDate(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-xs rounded-none font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-black uppercase text-zinc-400 block mb-1.5">Sampai Tanggal</label>
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
                  <span className="text-[11px] font-black text-[#A1A1AA] uppercase tracking-wider self-center mr-1">Pintasan Periode:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const todayStr = new Date().toISOString().substring(0, 10);
                      setIzinStartDate(todayStr);
                      setIzinEndDate(todayStr);
                    }}
                    className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-350 hover:text-white px-2.5 py-1.5 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
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
                    className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-350 hover:text-white px-2.5 py-1.5 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
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
                    className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-350 hover:text-white px-2.5 py-1.5 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    Bulan Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIzinStartDate("");
                      setIzinEndDate("");
                    }}
                    className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-350 hover:text-white px-2.5 py-1.5 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                  >
                    Tampilkan Semua
                  </button>
                </div>
              </div>

              {/* Pending list */}
              <div className="bg-[#121214] border border-[#27272A] p-4">
                <h4 className="text-[13px] font-black text-amber-500 uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3.5">
                  Pengganti Izin Pending - Butuh ACC ({filteredIzin.filter(iz => iz.status === "Pending").length})
                </h4>

                <div className="space-y-2.5">
                  {filteredIzin.filter(iz => iz.status === "Pending").length === 0 ? (
                    <p className="text-[12px] text-zinc-400 italic text-center py-4">Tidak ada pengajuan izin pending.</p>
                  ) : (
                    filteredIzin.filter(iz => iz.status === "Pending").map((iz) => (
                      <div key={iz.id} className="bg-[#0A0A0B] border border-amber-950/40 p-3.5 space-y-3 leading-relaxed text-xs">
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                          <div>
                            <span className="font-extrabold text-sm uppercase text-white block">{iz.nama}</span>
                            <span className="font-mono text-[11px] text-[#fbbf24] flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span>📅 Periode Libur: {iz.tanggal}</span>
                              {iz.tanggalSelesai && iz.tanggalSelesai !== iz.tanggal && (
                                <span>s/d {iz.tanggalSelesai}</span>
                              )}
                              <span className="text-[10px] bg-amber-950/80 border border-amber-800 text-amber-300 font-sans px-1.5 py-0.2 rounded font-extrabold">
                                {iz.jumlahHari || 1} Hari
                              </span>
                            </span>
                          </div>
                          <span className="text-[11px] bg-amber-950/20 border border-amber-900 text-amber-500 font-mono font-black uppercase px-2 py-0.5">
                            PENDING
                          </span>
                        </div>
                        <p className="text-[12.5px] text-zinc-350 italic">“{iz.alasan}”</p>
                        
                        <div className="flex flex-wrap gap-2 justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteIzin(iz.id)}
                            className="flex items-center gap-1 px-2.5 py-2 bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900 text-[12px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                            title="Hapus Pengajuan Izin (Jika salah input tanggal)"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => handleModerateLeave(iz.id, false)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-950 border border-red-900 text-red-500 hover:bg-red-950 text-[12px] font-black uppercase tracking-wider cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" /> Tolak
                          </button>
                          <button
                            type="button"
                            onClick={() => handleModerateLeave(iz.id, true)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-[12px] font-black uppercase tracking-wider cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Setujui (ACC)
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Moderated history */}
              <div className="bg-[#121214] border border-[#27272A] p-4">
                <h4 className="text-[13px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3">
                  Log Keputusan Moderasi Izin Selesai ({filteredIzin.filter(iz => iz.status !== "Pending").length})
                </h4>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {filteredIzin.filter(iz => iz.status !== "Pending").length === 0 ? (
                    <p className="text-[12px] text-zinc-500 italic text-center py-4">Belum ada keputusan izin yang dibuat.</p>
                  ) : (
                    filteredIzin.filter(iz => iz.status !== "Pending").map((iz) => (
                      <div key={iz.id} className="bg-[#0A0A0B] border border-zinc-950 p-2.5 text-[12px] flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-[13px] font-sans text-white uppercase">{iz.nama}</span>
                            <span className={`text-[10px] font-bold uppercase border px-1.5 py-0.2 ${
                              iz.status === "Disetujui"
                                ? "bg-emerald-950/20 border-emerald-900/30 text-emerald-400"
                                : "bg-red-950/20 border-red-940/30 text-red-400"
                            }`}>
                              {iz.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                            <span>
                              Tgl: {iz.tanggal}{iz.tanggalSelesai && iz.tanggalSelesai !== iz.tanggal ? ` s/d ${iz.tanggalSelesai}` : ""} ({iz.jumlahHari || 1} Hari)
                            </span>
                            {iz.alasan && (
                              <span className="text-zinc-500 italic truncate max-w-xs font-sans">
                                “{iz.alasan}”
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteIzin(iz.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-900/50 transition-colors cursor-pointer shrink-0"
                          title="Hapus log izin ini (jika salah input tanggal)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PAYROLL / penggajian */}
          {panelTab === "gaji" && (
            <div className="space-y-4 text-left font-sans animate-fade-in">
              
              {/* Segmented control for payroll sub-tabs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 bg-[#121214] p-1 border border-[#27272A] shrink-0 font-extrabold uppercase text-[12px] mb-2">
                <button
                  type="button"
                  onClick={() => setGajiSubTab("kalkulasi")}
                  className={`py-2 px-2 transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                    gajiSubTab === "kalkulasi" ? "bg-emerald-500 text-black font-black" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <span>🧮 Kalkulasi & Pembayaran</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGajiSubTab("potongan")}
                  className={`py-2 px-2 transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                    gajiSubTab === "potongan" ? "bg-rose-500 text-black font-black" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <span>✂️ Potongan Gaji (Alasan)</span>
                  {potonganGajiList.filter(p => p.status === "aktif").length > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 font-mono font-black rounded-full ${
                      gajiSubTab === "potongan" ? "bg-black text-rose-400" : "bg-rose-500 text-white"
                    }`}>
                      {potonganGajiList.filter(p => p.status === "aktif").length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setGajiSubTab("pencairan")}
                  className={`py-2 px-2 transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                    gajiSubTab === "pencairan" ? "bg-emerald-500 text-black font-black" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <span>💸 Pencairan & Bonus</span>
                </button>
              </div>

              {gajiSubTab === "kalkulasi" ? (
                <div className="space-y-4 font-sans">
                  <div className="bg-[#121214] border border-[#27272A] p-4 text-left leading-relaxed">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#27272A] pb-2 mb-2">
                  <h4 className="text-[13px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                    <CircleDollarSign className="w-4 h-4 shrink-0 text-emerald-500" /> KALKULASI GAJI MINGGUAN (KAMIS) & PENCATATAN
                  </h4>

                  {/* Quick Master Kasbon Download Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        exportKasbonAllEmployeesPDF({
                          karyawanList,
                          allKasbonHistory: kasbonHistoryList,
                          outletName: locationConfig.namaLokasi || "Clean & Fresh Laundry"
                        });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-rose-950/80 text-zinc-300 hover:text-rose-300 border border-zinc-700 hover:border-rose-700/60 text-[11px] font-bold uppercase transition rounded cursor-pointer"
                      title="Download rekap master kasbon seluruh karyawan format PDF"
                    >
                      <Download className="w-3 h-3 text-rose-400" />
                      <span>Rekap Kasbon PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        exportKasbonAllEmployeesCSV({
                          karyawanList,
                          allKasbonHistory: kasbonHistoryList,
                          outletName: locationConfig.namaLokasi || "Clean & Fresh Laundry"
                        });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-emerald-950/80 text-zinc-300 hover:text-emerald-300 border border-zinc-700 hover:border-emerald-700/60 text-[11px] font-bold uppercase transition rounded cursor-pointer"
                      title="Download rekap master kasbon seluruh karyawan format Excel/CSV"
                    >
                      <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                      <span>Rekap Kasbon CSV</span>
                    </button>
                  </div>
                </div>
                
                <div className="bg-amber-100 border border-amber-300 p-3 mb-3.5 text-xs text-left rounded-md">
                  <span className="text-[11px] font-black uppercase text-amber-800 tracking-wider block mb-1">PERIODE HARI GAJIAN AKTIF:</span>
                  <p className="text-[14.5px] text-zinc-950 font-mono font-extrabold">{getCurrentGajiPeriod().formatted.toUpperCase()}</p>
                </div>

                {/* Filter Periode Gaji & Staf */}
                <div className="bg-[#0A0A0B] border border-[#27272A] p-3 space-y-3 mb-3.5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
                    <div>
                      <label className="text-[11.5px] font-black uppercase text-zinc-400 block mb-1">Filter Nama Karyawan</label>
                      <select
                        value={gajiStaffFilter}
                        onChange={(e) => setGajiStaffFilter(e.target.value)}
                        className="w-full bg-[#121214] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-[12.5px] rounded-none font-bold cursor-pointer"
                      >
                        <option value="Semua">Semua Karyawan</option>
                        {karyawanList.map((st) => (
                          <option key={st.id} value={st.id}>{st.nama}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11.5px] font-black uppercase text-zinc-400 block mb-1">Mulai Tanggal</label>
                      <input
                        type="date"
                        value={gajiStartDate}
                        onChange={(e) => setGajiStartDate(e.target.value)}
                        className="w-full bg-[#121214] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-[12.5px] rounded-none font-bold font-mono cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-[11.5px] font-black uppercase text-zinc-400 block mb-1">Sampai Tanggal</label>
                      <input
                        type="date"
                        value={gajiEndDate}
                        onChange={(e) => setGajiEndDate(e.target.value)}
                        className="w-full bg-[#121214] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-[12.5px] rounded-none font-bold font-mono cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Pintasan Periode Cepat untuk Gaji */}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#27272A]/50">
                    <span className="text-[11.5px] font-black text-[#A1A1AA] uppercase tracking-wider self-center mr-1">Pintasan Periode:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const todayStr = new Date().toISOString().substring(0, 10);
                        setGajiStartDate(todayStr);
                        setGajiEndDate(todayStr);
                      }}
                      className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
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
                      className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
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
                      className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                    >
                      Bulan Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGajiStartDate("");
                        setGajiEndDate("");
                      }}
                      className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white px-2.5 py-1 border border-zinc-800 font-bold cursor-pointer transition-all uppercase"
                    >
                      Default Mingguan (Kamis)
                    </button>
                  </div>
                </div>

                <p className="text-[12.5px] text-zinc-350 font-semibold leading-relaxed mb-3.5">
                  Kalkulasi ini mengukur uang makan sesuai tingkat kehadiran di periode tanggal gajian aktif, yang secara default dirancang untuk siklus mingguan (Jumat - Kamis).
                </p>

                <div className="space-y-3">
                  {karyawanList.length === 0 ? (
                    <p className="text-[10px] text-zinc-500 text-center italic py-4">Belum ada data staf Pegawai.</p>
                  ) : (() => {
                    const filteredList = karyawanList.filter(
                      (staf) => gajiStaffFilter === "Semua" || staf.id === gajiStaffFilter
                    );
                    if (filteredList.length === 0) {
                      return (
                        <p className="text-[10.5px] text-zinc-400 text-center italic py-10 bg-[#0A0A0B] border border-[#27272A] font-mono">
                          Karyawan dengan filter nama tersebut tidak ditemukan.
                        </p>
                      );
                    }
                    return filteredList.map((staf) => {
                      const weeklyPeriod = getCurrentGajiPeriod();
                      const currentMonthYMD = new Date().toISOString().substring(0, 7); // "YYYY-MM"
                      const countHadir = absensiList.filter(a => a.karyawanId === staf.id && a.tanggal >= weeklyPeriod.startStr && a.tanggal <= weeklyPeriod.endStr).length;
                      const weeklyBaseSalary = staf.gajiPokok / 4;
                      const totalMakan = countHadir * staf.uangMakan;
                      
                      const countLiburDisetujui = izinList
                        .filter(iz => iz.karyawanId === staf.id && iz.status === "Disetujui" && (iz.tanggal.startsWith(currentMonthYMD) || (iz.tanggalSelesai && iz.tanggalSelesai.startsWith(currentMonthYMD))))
                        .reduce((acc, iz) => acc + (iz.jumlahHari || 1), 0);
                      const sisaLiburStr = `${Math.max(0, 3 - countLiburDisetujui)} / 3 Hari`;

                      const currentBonusInp = stafBonus[staf.id] !== undefined ? stafBonus[staf.id] : (staf.bonus || 0);
                      const currentKasbonInp = stafKasbon[staf.id] !== undefined ? stafKasbon[staf.id] : (staf.kasbon || 0);
                      const currentCatatanInp = stafCatatan[staf.id] !== undefined ? stafCatatan[staf.id] : (staf.catatanGaji || "");

                      const currentDeduction = stafKasbonPotong[staf.id] !== undefined ? stafKasbonPotong[staf.id] : 0;
                      
                      // Calculate dynamic salary withdrawals (Pencairan Gaji) from expenses!
                      const pencairanGajiList = (expenses || []).filter(
                        (exp) =>
                          isExpenseLinkedToStaf(exp, staf) &&
                          exp.date >= weeklyPeriod.startStr &&
                          exp.date <= weeklyPeriod.endStr
                      );
                      const totalPencairan = pencairanGajiList.reduce((sum, exp) => sum + exp.amount, 0);

                      // Active additional deductions with reasons
                      const activePotonganStaff = potonganGajiList.filter(
                        (p) => p.karyawanId === staf.id && p.status === "aktif"
                      );
                      const totalPotonganTambahan = activePotonganStaff.reduce((sum, p) => sum + p.jumlah, 0);
                      const grandTotalDeductions = currentDeduction + totalPotonganTambahan;

                      const payoutGaji = weeklyBaseSalary + totalMakan + currentBonusInp - grandTotalDeductions - totalPencairan;

                      return (
                        <div key={staf.id} className="bg-[#0A0A0B] border border-zinc-950 p-3.5 space-y-3.5 font-sans text-left">
                          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                             <span className="font-extrabold text-[15.5px] uppercase text-white">{staf.nama}</span>
                             <span className="text-[11.5px] font-mono text-zinc-400 bg-zinc-950 px-2.5 py-0.5 border border-zinc-900 font-semibold">
                               {countHadir} Hari Kerja Mingguan
                             </span>
                          </div>

                          {/* Breakdown Gajian & Kasbon dalam 2 Baris yang Rapi */}
                          <div className="space-y-2.5 font-mono text-[13px] font-semibold text-zinc-400">
                            {/* BARIS 1: Gaji Pokok, Total Uang Makan, Bonus (3 Kolom) */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-950/70 p-3 rounded-lg border border-zinc-900">
                              <div>
                                <p className="text-[11px] font-sans font-extrabold text-zinc-400 uppercase tracking-wider">Gaji Pokok Mingguan (1/4)</p>
                                <p className="text-white font-extrabold text-base mt-0.5">{formatIDR(weeklyBaseSalary)}</p>
                                <p className="text-[10.5px] text-zinc-500 font-normal mt-0.5">Bulanan: {formatIDR(staf.gajiPokok)}</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-sans font-extrabold text-zinc-400 uppercase tracking-wider">Total Uang Makan</p>
                                <p className="text-white font-extrabold text-base mt-0.5">{formatIDR(totalMakan)}</p>
                                <p className="text-[10.5px] text-zinc-500 font-normal mt-0.5">({formatIDR(staf.uangMakan)} / hari)</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-sans font-extrabold text-zinc-400 uppercase tracking-wider">Bonus (Owner)</p>
                                <p className="text-emerald-400 font-extrabold text-base mt-0.5">+ {formatIDR(currentBonusInp)}</p>
                              </div>
                            </div>

                            {/* BARIS 2: Potongan Gaji & Kasbon Tercatat (2 Kolom) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-950/70 p-3 rounded-lg border border-zinc-900">
                              <div>
                                <p className="text-[11px] font-sans font-extrabold text-rose-400 uppercase tracking-wider">Total Potongan Gaji</p>
                                <p className="text-rose-500 font-extrabold text-base mt-0.5">- {formatIDR(grandTotalDeductions)}</p>
                                <div className="text-[10.5px] text-zinc-400 font-normal mt-0.5 space-y-0.5">
                                  {currentDeduction > 0 && <p>Potongan Lain: {formatIDR(currentDeduction)}</p>}
                                  {totalPotonganTambahan > 0 && (
                                    <p className="text-rose-300 font-semibold">
                                      Potongan Tambahan ({activePotonganStaff.length}): -{formatIDR(totalPotonganTambahan)}
                                    </p>
                                  )}
                                  {grandTotalDeductions === 0 && <p className="text-zinc-500">Tidak ada potongan aktif</p>}
                                </div>
                              </div>
                              <div>
                                <p className="text-[11px] font-sans font-extrabold text-zinc-400 uppercase tracking-wider">Kasbon Tercatat</p>
                                <p className="text-amber-500 font-extrabold text-base mt-0.5">{formatIDR(currentKasbonInp)}</p>
                                
                                <div className="flex flex-col gap-1.5 mt-2.5 font-sans w-full">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInputPotonganKaryawanId(staf.id);
                                      setModalPotonganAmount("");
                                      setModalPotonganAlasan("");
                                      setActiveAddPotonganKaryawanId(staf.id);
                                    }}
                                    className="w-full px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-[11px] text-rose-400 hover:text-rose-300 border border-rose-500/30 font-extrabold cursor-pointer uppercase transition-all duration-150 rounded flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs"
                                  >
                                    <Scissors className="w-3.5 h-3.5" /> <span>+ Potongan Gaji (Alasan)</span>
                                  </button>
                                  {currentKasbonInp && currentKasbonInp > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDeductKaryawanId(staf.id);
                                        setDeductKasbonInput("");
                                      }}
                                      className="w-full px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-[11px] text-amber-400 hover:text-amber-300 border border-amber-500/30 font-extrabold cursor-pointer uppercase transition-all duration-150 rounded flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs"
                                    >
                                      <span>✂️</span> <span>Potong Kasbon</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setActiveHistoryKaryawanId(staf.id)}
                                    className="w-full px-3 py-1.5 bg-zinc-800/90 hover:bg-zinc-700 text-[11px] text-zinc-200 hover:text-white border border-zinc-700 font-extrabold cursor-pointer uppercase transition-all duration-150 rounded flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs"
                                  >
                                    <span>📋</span> <span>Riwayat Kasbon</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setActiveGajiHistoryKaryawanId(staf.id)}
                                    className="w-full px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900/90 text-[11px] text-emerald-300 hover:text-emerald-100 border border-emerald-800/80 font-extrabold cursor-pointer uppercase transition-all duration-150 rounded flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs"
                                  >
                                    <span>💵</span> <span>Riwayat Gajian</span>
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* DAFTAR POTONGAN GAJI TAMBAHAN (DENGAN KOLOM ALASAN) */}
                            {activePotonganStaff.length > 0 && (
                              <div className="bg-rose-950/20 border border-rose-900/50 p-3 rounded-lg text-xs space-y-2">
                                <div className="flex items-center justify-between border-b border-rose-900/40 pb-1.5">
                                  <span className="font-extrabold text-rose-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                                    <Scissors className="w-3.5 h-3.5 text-rose-400" />
                                    Daftar Potongan Gaji Tambahan Aktif ({activePotonganStaff.length} Item - Akan Dipotong):
                                  </span>
                                  <span className="font-mono font-black text-rose-400 text-[13px]">- {formatIDR(totalPotonganTambahan)}</span>
                                </div>
                                <div className="space-y-1.5">
                                  {activePotonganStaff.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between gap-2 bg-black/40 px-2.5 py-1.5 rounded border border-rose-900/30 text-[11.5px]">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-zinc-500 text-[10.5px]">{p.tanggal}</span>
                                        <span className="font-bold text-zinc-200">
                                          Alasan: <span className="text-rose-300 font-semibold underline decoration-dotted">{p.alasan}</span>
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-mono font-bold text-rose-400">- {formatIDR(p.jumlah)}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleDeletePotonganGaji(p)}
                                          className="text-zinc-500 hover:text-rose-400 p-0.5 cursor-pointer transition"
                                          title="Hapus catatan potongan ini"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Bright, stateful, and highly legible leave analysis card */}
                          <div className={`p-3 border rounded-md mb-3 text-xs flex flex-col gap-1.5 ${
                            countLiburDisetujui === 0 
                              ? "bg-emerald-50 border-emerald-200 text-emerald-950" 
                              : countLiburDisetujui < 3
                              ? "bg-amber-50 border-amber-200 text-amber-950"
                              : "bg-rose-50 border-rose-200 text-rose-950"
                          }`}>
                            <div className="flex items-center justify-between">
                              <span className="font-sans font-extrabold uppercase text-[11.5px] tracking-wider text-zinc-600">ANALISIS JATAH LIBUR (BULAN INI):</span>
                              <span className="font-mono text-[13px] font-black">
                                Cuti: <span className="underline">{countLiburDisetujui} Hari</span>
                              </span>
                            </div>
                            
                            <div className="flex items-center justify-between border-t border-dotted border-zinc-300 pt-1.5 mt-0.5">
                              <span className="text-[13px] font-medium flex items-center gap-1">
                                STATUS: 
                                {countLiburDisetujui === 0 && <span className="font-black text-emerald-700">🟢 UTUH (Jatah Aman)</span>}
                                {countLiburDisetujui > 0 && countLiburDisetujui < 3 && <span className="font-black text-amber-700">🟡 TERPAKAI SEBAGIAN</span>}
                                {countLiburDisetujui >= 3 && <span className="font-black text-rose-700">🔴 MAKSIMAL (Kuota Habis)</span>}
                              </span>
                              <span className="font-mono font-extrabold text-[13px]">
                                Sisa Quota: {sisaLiburStr}
                              </span>
                            </div>
                            
                            <div className="text-[11.5px] leading-tight text-zinc-600 mt-1">
                              💡 <span className="font-semibold">Panduan Warna Status:</span> <span className="text-emerald-750 font-bold">Hijau (Lengkap 3 hari)</span>, <span className="text-amber-750 font-bold">Kuning (Terpakai &lt; 3 hari)</span>, <span className="text-rose-750 font-bold">Merah (Kuota habis/Lebih)</span>.
                            </div>
                          </div>

                          {totalPencairan > 0 && (
                            <div className="bg-amber-100 border border-amber-300 p-3 mb-3 text-xs flex items-center justify-between font-sans rounded-md shadow-sm animate-fade-in">
                              <span className="font-extrabold uppercase text-[12.5px] tracking-wider text-amber-900">SUDAH DICAIRKAN (UANG MUKA GAJI):</span>
                              <span className="text-[15px] text-red-700 font-mono font-extrabold">- {formatIDR(totalPencairan)}</span>
                            </div>
                          )}

                          {/* Dynamic Inputs per user Row */}
                          <div className="bg-[#121214] border border-[#27272A] p-3 space-y-3 text-[11px]">
                            <span className="text-[12px] font-black uppercase tracking-wider text-[#A1A1AA] block border-b border-[#27272A] pb-1">Edit Parameter Slip Gaji (Owner)</span>
                            
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[11px] font-bold text-zinc-400 uppercase block mb-0.5">Bonus Insentif (Rp)</label>
                                <input
                                  type="number"
                                  value={currentBonusInp}
                                  onChange={(e) => setStafBonus({ ...stafBonus, [staf.id]: Number(e.target.value) })}
                                  className="w-full bg-[#0A0A0B] border border-zinc-900 focus:border-emerald-500 text-white font-mono px-2 py-1 outline-none rounded-none text-[12.5px]"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-zinc-400 uppercase block mb-0.5">Edit Saldo Kasbon (Rp)</label>
                                <input
                                  type="number"
                                  value={currentKasbonInp}
                                  onChange={(e) => setStafKasbon({ ...stafKasbon, [staf.id]: Number(e.target.value) })}
                                  className="w-full bg-[#0A0A0B] border border-zinc-900 focus:border-emerald-500 text-white font-mono px-2 py-1 outline-none rounded-none text-[12.5px]"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-black text-amber-400 uppercase block mb-0.5">Potong Gaji Lainnya (Rp)</label>
                                <div className="flex gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={currentDeduction === 0 ? "" : currentDeduction}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setStafKasbonPotong({
                                        ...stafKasbonPotong,
                                        [staf.id]: Math.max(0, val)
                                      });
                                    }}
                                    className="w-full bg-[#0E0E0B] border border-amber-950 focus:border-amber-500 text-white font-mono px-2 py-1 outline-none rounded-none text-[12.5px]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const maxAllow = weeklyBaseSalary + totalMakan + currentBonusInp;
                                      setStafKasbonPotong({
                                        ...stafKasbonPotong,
                                        [staf.id]: maxAllow
                                      });
                                    }}
                                    className="px-2 bg-amber-600/10 hover:bg-amber-600 text-amber-500 hover:text-black border border-amber-600/25 font-black uppercase text-[10px] cursor-pointer"
                                    title="Set potongan maksimal seharga total pendapatan"
                                  >
                                    MAX
                                  </button>
                                </div>
                                {currentDeduction > 0 && (
                                  <input
                                    type="text"
                                    placeholder="Alasan potongan (misal: Pulang awal / Terlambat)"
                                    value={stafKasbonPotongNotes[staf.id] || ""}
                                    onChange={(e) => setStafKasbonPotongNotes({ ...stafKasbonPotongNotes, [staf.id]: e.target.value })}
                                    className="w-full mt-1 bg-[#0E0E0B] border border-amber-950/70 focus:border-amber-500 text-amber-200 text-[11px] px-2 py-1 outline-none rounded-none placeholder-amber-800/80"
                                  />
                                )}
                              </div>
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-zinc-400 uppercase block mb-0.5">Catatan Tambahan Khusus</label>
                              <input
                                type="text"
                                value={currentCatatanInp}
                                onChange={(e) => setStafCatatan({ ...stafCatatan, [staf.id]: e.target.value })}
                                className="w-full bg-[#0A0A0B] border border-zinc-900 focus:border-emerald-500 text-white px-2 py-1.5 outline-none rounded-none text-[12.5px]"
                                placeholder="Gaji bulanan aman + lembur minggu ke-2"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleUpdateGajiParams(staf.id, currentBonusInp, currentKasbonInp, currentCatatanInp)}
                              className="w-full py-2 bg-[#1A1A1E] hover:bg-zinc-800 text-zinc-350 hover:text-white border border-zinc-700 font-extrabold text-[11px] uppercase tracking-wider cursor-pointer"
                            >
                              Simpan Parameter Finansial Staf
                            </button>

                            {/* 🚀 ADD ACCUMULATIVE KASBON & BONUS FEATURE */}
                            <div className="border-t border-[#27272A] pt-3 mt-3 text-left">
                              <span className="text-[12px] font-black uppercase tracking-wider text-[#A1A1AA] block mb-3">
                                ➕ TAMBAH KASBON / BONUS (AKUMULATIF LANGSUNG)
                              </span>
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Tambah Kasbon (Light Warm Amber Theme) */}
                                <div className="space-y-3 bg-[#FCFAF6] border border-amber-200/90 p-4 rounded-xl shadow-sm">
                                  <div className="flex items-center justify-between border-b border-amber-100 pb-2">
                                    <label className="text-[13px] font-extrabold text-amber-800 uppercase tracking-wider">Tambah Kasbon (+)</label>
                                    <span className="text-[9.5px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded uppercase">Kasbon Baru</span>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div>
                                        <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide block mb-1">Nominal (Rp)</span>
                                        <input
                                          type="text"
                                          placeholder="misal: 50.000"
                                          value={tambahKasbonInput[staf.id] !== undefined ? tambahKasbonInput[staf.id] : ""}
                                          onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, "");
                                            setTambahKasbonInput({
                                              ...tambahKasbonInput,
                                              [staf.id]: val ? formatRupiah(val) : ""
                                            });
                                          }}
                                          className="w-full bg-white border border-amber-250 text-amber-950 font-mono font-bold px-3 py-2 outline-none rounded-md text-[12.5px] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-sm transition-all placeholder:text-zinc-400"
                                        />
                                      </div>
                                      <div>
                                        <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide block mb-1">Tanggal</span>
                                        <input
                                          type="date"
                                          value={tambahKasbonDate[staf.id] || getTodayDateStr()}
                                          onChange={(e) => {
                                            setTambahKasbonDate({
                                              ...tambahKasbonDate,
                                              [staf.id]: e.target.value
                                            });
                                          }}
                                          className="w-full bg-white border border-amber-250 text-amber-950 font-mono font-bold px-3 py-2 outline-none rounded-md text-[12.5px] cursor-pointer focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-sm transition-all"
                                        />
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cleanNum = parseRupiah(tambahKasbonInput[staf.id] || "");
                                        const chosenDate = tambahKasbonDate[staf.id] || getTodayDateStr();
                                        handleAddNewKasbon(staf.id, cleanNum, chosenDate);
                                      }}
                                      className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold cursor-pointer uppercase text-[11px] rounded-md tracking-wider transition-all text-center flex justify-center items-center shadow-md shadow-amber-200/50"
                                    >
                                      + Proses Kasbon Baru
                                    </button>
                                  </div>
                                </div>

                                {/* Tambah Bonus (Light Cool Emerald Theme) */}
                                <div className="space-y-3 bg-[#FAFCFB] border border-emerald-200/90 p-4 rounded-xl shadow-sm">
                                  <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                                    <label className="text-[13px] font-extrabold text-emerald-800 uppercase tracking-wider">Tambah Bonus (+)</label>
                                    <span className="text-[9.5px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">Reward Bonus</span>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div>
                                        <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide block mb-1">Nominal (Rp)</span>
                                        <input
                                          type="text"
                                          placeholder="misal: 100.000"
                                          value={tambahBonusInput[staf.id] !== undefined ? tambahBonusInput[staf.id] : ""}
                                          onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, "");
                                            setTambahBonusInput({
                                              ...tambahBonusInput,
                                              [staf.id]: val ? formatRupiah(val) : ""
                                            });
                                          }}
                                          className="w-full bg-white border border-emerald-250 text-emerald-950 font-mono font-bold px-3 py-2 outline-none rounded-md text-[12.5px] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-sm transition-all placeholder:text-zinc-400"
                                        />
                                      </div>
                                      <div>
                                        <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide block mb-1">Tanggal</span>
                                        <input
                                          type="date"
                                          value={tambahBonusDate[staf.id] || getTodayDateStr()}
                                          onChange={(e) => {
                                            setTambahBonusDate({
                                              ...tambahBonusDate,
                                              [staf.id]: e.target.value
                                            });
                                          }}
                                          className="w-full bg-white border border-emerald-250 text-emerald-950 font-mono font-bold px-3 py-2 outline-none rounded-md text-[12.5px] cursor-pointer focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-sm transition-all"
                                        />
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cleanNum = parseRupiah(tambahBonusInput[staf.id] || "");
                                        const chosenDate = tambahBonusDate[staf.id] || getTodayDateStr();
                                        handleAddNewBonus(staf.id, cleanNum, chosenDate);
                                      }}
                                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold cursor-pointer uppercase text-[11px] rounded-md tracking-wider transition-all text-center flex justify-center items-center shadow-md shadow-emerald-200/50"
                                    >
                                      + Proses Bonus Baru
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 🏷️ TRANSAKSI PENCAIRAN MANDIRI (GAJI AWAL / BONUS) */}
                          <div className="bg-[#121214] border border-[#27272A] p-3 space-y-3 rounded-none">
                            <div className="flex items-center justify-between border-b border-[#27272A] pb-1.5 gap-2 flex-wrap text-left">
                              <span className="text-[11.5px] font-black uppercase tracking-widest text-emerald-450 flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" /> FITUR PENCAIRAN INSTAN ({staf.nama})
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono">
                                Langsung Terintegrasi Kas & Pembukuan
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (activeDisbKaryawanId === staf.id && activeDisbType === "withdrawal") {
                                    setActiveDisbKaryawanId(null);
                                    setActiveDisbType(null);
                                  } else {
                                    setActiveDisbKaryawanId(staf.id);
                                    setActiveDisbType("withdrawal");
                                    setDisbAmount("");
                                  }
                                }}
                                className={`py-1.5 px-2 text-[11.5px] font-black uppercase tracking-wide border cursor-pointer text-center duration-150 ${
                                  activeDisbKaryawanId === staf.id && activeDisbType === "withdrawal"
                                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                                    : "bg-zinc-950 border-[#27272A] text-[#A1A1AA] hover:text-white"
                                }`}
                              >
                                ⚡ Gaji Awal (Uang Muka)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (activeDisbKaryawanId === staf.id && activeDisbType === "bonus") {
                                    setActiveDisbKaryawanId(null);
                                    setActiveDisbType(null);
                                  } else {
                                    setActiveDisbKaryawanId(staf.id);
                                    setActiveDisbType("bonus");
                                    setDisbBonusAmount((staf.bonus || 0).toString());
                                    setDisbBonusNotes("");
                                  }
                                }}
                                className={`py-1.5 px-2 text-[11.5px] font-black uppercase tracking-wide border cursor-pointer text-center duration-150 ${
                                  activeDisbKaryawanId === staf.id && activeDisbType === "bonus"
                                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                                    : "bg-zinc-950 border-[#27272A] text-[#A1A1AA] hover:text-white"
                                }`}
                              >
                                🎁 Pencairan Bonus ({formatIDR(staf.bonus || 0)})
                              </button>
                            </div>

                            {/* CONTAINER INPUT UNTUK FORM YANG AKTIF */}
                            {activeDisbKaryawanId === staf.id && activeDisbType === "withdrawal" && (
                              <div className="bg-zinc-950 border border-[#27272A] p-2.5 text-[10px] space-y-2.5 text-left animate-fade-in rounded-none">
                                <div className="text-[11.5px] font-black text-emerald-450 border-b border-[#27272A] pb-1 flex items-center justify-between">
                                  <span>FORMULIR PENCAIRAN GAJI AWAL STAF</span>
                                  <span className="text-[9.5px] text-zinc-500 px-1 border border-zinc-800 bg-zinc-950">Gaji Dipercepat</span>
                                </div>

                                <div className="space-y-2">
                                  <div>
                                    <label className="text-[11px] font-black text-zinc-400 uppercase block mb-0.5">Nominal Pencairan Gaji Awal (Rp)</label>
                                    <input
                                      type="text"
                                      placeholder="0"
                                      value={disbAmount ? formatRupiah(disbAmount) : ""}
                                      onChange={(e) => setDisbAmount(e.target.value.replace(/\D/g, ""))}
                                      className="w-full bg-[#0A0A0B] border border-zinc-900 text-emerald-450 font-mono font-bold px-2 py-1 outline-none rounded-none text-[12.5px]"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[11px] font-black text-zinc-400 uppercase block mb-1">Metode Pembayaran</label>
                                    <div className="grid grid-cols-3 gap-1">
                                      {["Transfer Bank", "Tunai", "QRIS"].map((method) => (
                                        <button
                                          key={method}
                                          type="button"
                                          onClick={() => setDisbPaymentMethod(method)}
                                          className={`py-1 text-[10.5px] font-extrabold uppercase tracking-tight border transition-all duration-100 cursor-pointer ${
                                            disbPaymentMethod === method
                                              ? "bg-[#121214] border-emerald-500 text-emerald-450"
                                              : "bg-[#0A0A0B] border-[#27272A] text-zinc-500"
                                          }`}
                                        >
                                          {method}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div>
                                    <label className="text-[11px] font-black text-zinc-400 uppercase block mb-0.5">Tanggal Pembayaran</label>
                                    <input
                                      type="date"
                                      value={disbDate}
                                      onChange={(e) => setDisbDate(e.target.value)}
                                      className="w-full bg-[#0A0A0B] border border-zinc-900 text-white font-mono px-2 py-1 outline-none rounded-none text-[12.5px]"
                                    />
                                  </div>

                                  <p className="text-[11.5px] text-amber-500 leading-normal font-sans italic pt-0.5 text-left">
                                    ⚠️ PENTING: Pencairan ini otomatis tercatat di pengeluaran kas toko, dan otomatis mengurangi (memotong) sisa pembayaran gaji bersih pada slip gaji mingguan staf.
                                  </p>

                                  <button
                                    type="button"
                                    onClick={() => handleProcessDisbGajiAwal(staf.id, disbAmount, disbPaymentMethod, disbDate)}
                                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-450 text-black text-[11.5px] font-black uppercase cursor-pointer rounded-none tracking-wider flex items-center justify-center gap-1 duration-150"
                                  >
                                    <Check className="w-3.5 h-3.5 text-black" /> PROSES PENCAIRAN GAJI AWAL
                                  </button>
                                </div>
                              </div>
                            )}

                            {activeDisbKaryawanId === staf.id && activeDisbType === "bonus" && (
                              <div className="bg-zinc-950 border border-[#27272A] p-2.5 text-[10px] space-y-2.5 text-left animate-fade-in rounded-none">
                                <div className="text-[11.5px] font-black text-emerald-450 border-b border-[#27272A] pb-1 flex items-center justify-between">
                                  <span>FORMULIR PENCAIRAN BONUS STAF</span>
                                  <span className="text-[9.5px] text-emerald-500 px-1 bg-emerald-950/40 border border-emerald-900/30">BEBAS POTONGAN GAJI MINGGUAN</span>
                                </div>

                                <div className="bg-emerald-950/20 border border-emerald-955/45 p-2 text-[11.5px] text-emerald-450 font-sans flex items-center justify-between">
                                  <span>SALDO BONUS TERSEDIA (PENDING)</span>
                                  <strong className="text-[13px] font-mono font-black">{formatIDR(staf.bonus || 0)}</strong>
                                </div>

                                <div className="space-y-2">
                                  <div>
                                    <label className="text-[11px] font-black text-zinc-400 uppercase block mb-0.5">Jumlah Pencairan Bonus (Rp)</label>
                                    <input
                                      type="text"
                                      placeholder="0"
                                      value={disbBonusAmount ? formatRupiah(disbBonusAmount) : ""}
                                      onChange={(e) => setDisbBonusAmount(e.target.value.replace(/\D/g, ""))}
                                      className="w-full bg-[#0A0A0B] border border-zinc-900 text-emerald-450 font-mono font-bold px-2 py-1 outline-none rounded-none text-[12.5px]"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[11px] font-black text-zinc-400 uppercase block mb-1">Metode Pembayaran</label>
                                    <div className="grid grid-cols-3 gap-1">
                                      {["Transfer Bank", "Tunai", "QRIS"].map((method) => (
                                        <button
                                          key={method}
                                          type="button"
                                          onClick={() => setDisbBonusPaymentMethod(method)}
                                          className={`py-1 text-[10.5px] font-extrabold uppercase tracking-tight border transition-all duration-100 cursor-pointer ${
                                            disbBonusPaymentMethod === method
                                              ? "bg-[#121214] border-emerald-500 text-emerald-450"
                                              : "bg-[#0A0A0B] border-[#27272A] text-zinc-500"
                                          }`}
                                        >
                                          {method}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div>
                                    <label className="text-[11px] font-black text-zinc-400 uppercase block mb-0.5">Tanggal Pembayaran</label>
                                    <input
                                      type="date"
                                      value={disbBonusDate}
                                      onChange={(e) => setDisbBonusDate(e.target.value)}
                                      className="w-full bg-[#0A0A0B] border border-zinc-900 text-white font-mono px-2 py-1 outline-none rounded-none text-[12.5px]"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[11px] font-black text-zinc-400 uppercase block mb-0.5">Catatan / Keterangan (Opsional)</label>
                                    <input
                                      type="text"
                                      value={disbBonusNotes}
                                      onChange={(e) => setDisbBonusNotes(e.target.value)}
                                      placeholder="misal: bonus target omset bulanan"
                                      className="w-full bg-[#0A0A0B] border border-zinc-900 text-zinc-200 px-2 py-1 outline-none rounded-none text-[12.5px] font-semibold"
                                    />
                                  </div>

                                  <p className="text-[11.5px] text-zinc-500 leading-normal font-sans italic pt-0.5 text-left">
                                    💡 Info: Pencairan bonus langsung memotong saldo pending bonus milik staf di sistem, tanpa memotong total gaji mingguan/kehadiran staf pada slip ini.
                                  </p>

                                  <button
                                    type="button"
                                    onClick={() => handleProcessDisbBonus(staf.id, disbBonusAmount, disbBonusPaymentMethod, disbBonusDate, disbBonusNotes)}
                                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-450 text-black text-[11.5px] font-black uppercase cursor-pointer rounded-none tracking-wider flex items-center justify-center gap-1 duration-150"
                                  >
                                    <Check className="w-3.5 h-3.5 text-black" /> PROSES PENCAIRAN BONUS
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* MINI RIWAYAT TRANSAKSI INSTAN STAF LOKAL */}
                            {(() => {
                              const relatedExpenses = (expenses || []).filter((exp) => {
                                const isBonusDisb = exp.pencairanBonus === true || 
                                  (exp.category === "Gaji Karyawan" && 
                                   exp.subCategory === "Bonus / Lembur" && 
                                   exp.karyawanId === staf.id &&
                                   exp.title.includes("Pencairan Bonus"));

                                const isGajiAwalDisb = exp.pencairanGaji === true ||
                                  (exp.category === "Gaji Karyawan" &&
                                   exp.subCategory === "Pencairan Gaji" &&
                                   exp.karyawanId === staf.id &&
                                   exp.title.includes("Pencairan Gaji"));

                                return (isBonusDisb || isGajiAwalDisb) && exp.karyawanId === staf.id;
                              });

                              if (relatedExpenses.length === 0) return null;

                              return (
                                <div className="space-y-1.5 pt-2.5 border-t border-zinc-900 text-left animate-fade-in">
                                  <span className="text-[11.5px] font-black uppercase text-[#A1A1AA] tracking-widest block">Riwayat Pencairan Instan</span>
                                  <div className="space-y-1 max-h-[170px] overflow-y-auto pr-1">
                                    {relatedExpenses.map((exp) => {
                                      const isBonus = exp.pencairanBonus === true || exp.subCategory?.toLowerCase().includes("bonus");
                                      return (
                                        <div
                                          key={exp.id}
                                          className="text-[11.5px] font-mono bg-zinc-950 border border-zinc-900 p-2 flex items-center justify-between gap-3"
                                        >
                                          <div className="space-y-0.5">
                                            <div className="flex items-center gap-1 flex-wrap">
                                              <span className={`text-[9px] font-black px-1.5 py-0.5 tracking-wider uppercase border ${
                                                isBonus ? "bg-emerald-950 text-emerald-400 border-emerald-900/30" : "bg-sky-950 text-sky-400 border-sky-900/30"
                                              }`}>
                                                {isBonus ? "Bonus" : "Gaji Awal"}
                                              </span>
                                              <span className="text-zinc-500 font-sans text-[10px]">{exp.date}</span>
                                              <span className="text-zinc-400 font-sans text-[10px] bg-[#121214] px-1">{exp.paymentMethod}</span>
                                            </div>
                                            <div className="text-zinc-300 text-[12px]">
                                              Jumlah: <strong className={isBonus ? "text-emerald-400 font-black" : "text-amber-550 font-black"}>{formatIDR(exp.amount)}</strong>
                                            </div>
                                            {exp.notes ? <div className="text-[10px] text-zinc-500 leading-tight">Ket: {exp.notes}</div> : null}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (isBonus) {
                                                handleDeleteBonusDisbursement(exp);
                                              } else {
                                                handleCancelPencairanGaji(exp);
                                              }
                                            }}
                                            className="p-1 px-2 border border-zinc-800 hover:border-red-900 bg-[#121214] hover:bg-red-950/20 text-zinc-500 hover:text-red-400 duration-150 text-[10px] font-black uppercase cursor-pointer"
                                            title="Batalkan transaksi ini dan kembalikan ke kas"
                                          >
                                            BATALKAN
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          <div className="pt-2.5 border-t border-dashed border-zinc-900 flex items-center justify-between">
                            <div>
                              <span className="text-[11.5px] font-black text-zinc-400 block uppercase leading-none">TOTAL GAJI NET BARU</span>
                              <span className="text-[17.5px] font-black font-mono text-emerald-450">
                                {formatIDR(payoutGaji)}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => downloadSlipGajiForStaf(staf, currentDeduction, currentBonusInp, currentKasbonInp, currentCatatanInp)}
                                className="px-3 py-1.5 bg-zinc-900 hover:bg-[#1A1A1E] text-zinc-350 hover:text-white border border-zinc-800 font-bold text-[10px] uppercase cursor-pointer flex items-center gap-1"
                              >
                                <Download className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Unduh PDF</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleProcessPayroll(staf, countHadir, totalMakan, currentDeduction, currentBonusInp, currentKasbonInp, currentCatatanInp)}
                                className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-900 text-emerald-450 hover:text-emerald-400 border border-emerald-950/60 hover:border-emerald-500 font-black text-[10px] uppercase cursor-pointer"
                              >
                                Bayar & Rekam Pengeluaran
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              
              </div>
              ) : gajiSubTab === "potongan" ? (
                /* ✂️ SUB-TAB: KELOLA POTONGAN GAJI TAMBAHAN (DENGAN KOLOM ALASAN) */
                <div className="space-y-4 animate-fade-in text-left font-sans">
                  {/* Header info */}
                  <div className="bg-[#121214] border border-[#27272A] p-4 text-left leading-relaxed">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#27272A] pb-3 mb-4">
                      <div>
                        <h4 className="text-[13px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Scissors className="w-4 h-4 shrink-0 text-rose-500" /> KELOLA POTONGAN GAJI TAMBAHAN (KOLOM ALASAN)
                        </h4>
                        <p className="text-[11.5px] text-zinc-400 mt-1">
                          Catat potongan gaji tambahan dengan kolom alasan jelas (keterlambatan, baju luntur/rusak, pelanggaran SOP, dll). Potongan berstatus <strong>Aktif</strong> otomatis memotong gaji saat pembayaran payroll mingguan.
                        </p>
                      </div>
                      <span className="text-[11px] font-mono px-2.5 py-1 bg-rose-950/60 border border-rose-900/80 text-rose-300 font-bold rounded">
                        {potonganGajiList.filter(p => p.status === "aktif").length} Potongan Aktif
                      </span>
                    </div>

                    {/* FORM INPUT POTONGAN BARU */}
                    <div className="bg-[#0A0A0B] border border-rose-950/50 p-4 rounded-lg mb-5 space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                        <span className="text-[12px] font-extrabold uppercase text-rose-300 tracking-wider flex items-center gap-1.5">
                          <Plus className="w-4 h-4 text-rose-400" /> Form Tambah Potongan Gaji Baru
                        </span>
                        <span className="text-[10.5px] text-zinc-500 font-medium">Lengkapi nominal dan alasan</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Karyawan */}
                        <div>
                          <label className="text-[11px] font-bold text-zinc-300 uppercase block mb-1">Pilih Karyawan</label>
                          <select
                            value={inputPotonganKaryawanId}
                            onChange={(e) => setInputPotonganKaryawanId(e.target.value)}
                            className="w-full bg-[#121214] border border-zinc-800 focus:border-rose-500 text-white px-3 py-2 text-[12.5px] font-bold outline-none rounded cursor-pointer"
                          >
                            <option value="">-- Pilih Staf --</option>
                            {karyawanList.map((k) => (
                              <option key={k.id} value={k.id}>{k.nama} ({k.posisi})</option>
                            ))}
                          </select>
                        </div>

                        {/* Nominal Potongan */}
                        <div>
                          <label className="text-[11px] font-bold text-zinc-300 uppercase block mb-1">Nominal Potongan (Rp)</label>
                          <input
                            type="text"
                            placeholder="Contoh: 50.000"
                            value={inputPotonganAmount ? formatRupiah(inputPotonganAmount) : ""}
                            onChange={(e) => setInputPotonganAmount(e.target.value.replace(/\D/g, ""))}
                            className="w-full bg-[#121214] border border-zinc-800 focus:border-rose-500 text-rose-400 font-mono font-bold px-3 py-2 text-[13px] outline-none rounded placeholder:text-zinc-600"
                          />
                          {/* Quick nominal presets */}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {[10000, 20000, 25000, 50000, 100000].map((nominal) => (
                              <button
                                key={nominal}
                                type="button"
                                onClick={() => setInputPotonganAmount(nominal.toString())}
                                className="px-1.5 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-zinc-300 hover:text-white rounded border border-zinc-800 cursor-pointer"
                              >
                                +{nominal >= 1000 ? `${nominal / 1000}rb` : nominal}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Tanggal Potongan */}
                        <div>
                          <label className="text-[11px] font-bold text-zinc-300 uppercase block mb-1">Tanggal</label>
                          <input
                            type="date"
                            value={inputPotonganTanggal}
                            onChange={(e) => setInputPotonganTanggal(e.target.value)}
                            className="w-full bg-[#121214] border border-zinc-800 focus:border-rose-500 text-white font-mono px-3 py-2 text-[12.5px] font-bold outline-none rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* KOLOM ALASAN (Wajib) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-rose-300 uppercase block">
                            Kolom Alasan Pemotongan <span className="text-rose-500">*</span>
                          </label>
                          <span className="text-[10.5px] text-zinc-500">Pilih opsi cepat atau ketik sendiri</span>
                        </div>
                        <input
                          type="text"
                          placeholder="Ketik alasan spesifik (misal: Terlambat masuk 40 menit / Baju pelanggan sobek saat setrika)"
                          value={inputPotonganAlasan}
                          onChange={(e) => setInputPotonganAlasan(e.target.value)}
                          className="w-full bg-[#121214] border border-rose-950 focus:border-rose-500 text-rose-100 px-3 py-2 text-[12.5px] outline-none rounded placeholder:text-zinc-600"
                        />

                        {/* Quick Presets for Alasan */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold">Preset Alasan:</span>
                          {[
                            "⏱️ Terlambat Masuk Kerja",
                            "👕 Kerusakan Pakaian Pelanggan",
                            "👔 Pelanggaran SOP / Seragam",
                            "🚪 Pulang Kerja Lebih Awal",
                            "📦 Kerusakan Alat / Inventaris",
                            "❌ Alpa / Izin Tanpa Konfirmasi",
                            "💸 Selisih Kasir / Setoran",
                            "🧹 Kebersihan Outlet Tidak Selesai"
                          ].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setInputPotonganAlasan(preset)}
                              className={`px-2 py-0.5 text-[10.5px] rounded border cursor-pointer transition ${
                                inputPotonganAlasan === preset
                                  ? "bg-rose-950/70 border-rose-600 text-rose-200 font-bold"
                                  : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Button Submit */}
                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (!inputPotonganKaryawanId) {
                              alert("Silakan pilih karyawan terlebih dahulu.");
                              return;
                            }
                            const cleanNum = Number(inputPotonganAmount);
                            if (!cleanNum || cleanNum <= 0) {
                              alert("Silakan masukkan nominal potongan yang valid.");
                              return;
                            }
                            if (!inputPotonganAlasan.trim()) {
                              alert("Kolom alasan wajib diisi.");
                              return;
                            }
                            handleSavePotonganGaji(
                              inputPotonganKaryawanId,
                              cleanNum,
                              inputPotonganAlasan.trim(),
                              inputPotonganTanggal
                            );
                            setInputPotonganAmount("");
                            setInputPotonganAlasan("");
                          }}
                          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[12px] uppercase rounded tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-900/30"
                        >
                          <Plus className="w-4 h-4" /> Simpan Potongan Gaji
                        </button>
                      </div>
                    </div>

                    {/* METRICS & RINGKASAN */}
                    {(() => {
                      const totalAktifNominal = potonganGajiList
                        .filter(p => p.status === "aktif")
                        .reduce((sum, p) => sum + p.jumlah, 0);
                      const totalDipotongNominal = potonganGajiList
                        .filter(p => p.status === "dipotong")
                        .reduce((sum, p) => sum + p.jumlah, 0);
                      const totalItemAktif = potonganGajiList.filter(p => p.status === "aktif").length;

                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                          <div className="bg-[#0A0A0B] border border-rose-900/40 p-3 rounded-lg">
                            <span className="text-[10.5px] uppercase font-bold text-rose-400 block tracking-wider">Potongan Aktif (Siap Dipotong)</span>
                            <span className="text-xl font-mono font-black text-rose-400 mt-1 block">{formatIDR(totalAktifNominal)}</span>
                            <span className="text-[10.5px] text-zinc-500 font-medium">{totalItemAktif} transaksi aktif</span>
                          </div>

                          <div className="bg-[#0A0A0B] border border-zinc-800 p-3 rounded-lg">
                            <span className="text-[10.5px] uppercase font-bold text-zinc-400 block tracking-wider">Potongan Sudah Dipotong</span>
                            <span className="text-xl font-mono font-black text-zinc-300 mt-1 block">{formatIDR(totalDipotongNominal)}</span>
                            <span className="text-[10.5px] text-zinc-500 font-medium">Sudah diselesaikan pada slip gaji</span>
                          </div>

                          <div className="bg-[#0A0A0B] border border-zinc-800 p-3 rounded-lg">
                            <span className="text-[10.5px] uppercase font-bold text-zinc-400 block tracking-wider">Total Catatan Potongan</span>
                            <span className="text-xl font-mono font-black text-white mt-1 block">{potonganGajiList.length} Item</span>
                            <span className="text-[10.5px] text-zinc-500 font-medium">Semua data riwayat potongan</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* FILTER & PENCARIAN RIWAYAT */}
                    <div className="bg-[#0A0A0B] border border-zinc-900 p-3 rounded-lg mb-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="text-[10.5px] uppercase font-bold text-zinc-400 block mb-1">Filter Karyawan</label>
                          <select
                            value={potonganStaffFilter}
                            onChange={(e) => setPotonganStaffFilter(e.target.value)}
                            className="w-full bg-[#121214] border border-zinc-800 text-white px-2.5 py-1.5 text-[12px] font-bold outline-none rounded cursor-pointer"
                          >
                            <option value="Semua">Semua Karyawan</option>
                            {karyawanList.map(k => (
                              <option key={k.id} value={k.id}>{k.nama}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10.5px] uppercase font-bold text-zinc-400 block mb-1">Filter Status</label>
                          <select
                            value={potonganStatusFilter}
                            onChange={(e) => setPotonganStatusFilter(e.target.value as any)}
                            className="w-full bg-[#121214] border border-zinc-800 text-white px-2.5 py-1.5 text-[12px] font-bold outline-none rounded cursor-pointer"
                          >
                            <option value="Semua">Semua Status</option>
                            <option value="aktif">Aktif (Belum Dipotong)</option>
                            <option value="dipotong">Sudah Dipotong di Gajian</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10.5px] uppercase font-bold text-zinc-400 block mb-1">Cari Karyawan / Kolom Alasan</label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Cari alasan atau nama..."
                              value={potonganSearch}
                              onChange={(e) => setPotonganSearch(e.target.value)}
                              className="w-full bg-[#121214] border border-zinc-800 text-white pl-8 pr-2.5 py-1.5 text-[12px] outline-none rounded placeholder:text-zinc-600"
                            />
                            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* TABEL DATA POTONGAN GAJI */}
                    {(() => {
                      const filteredList = potonganGajiList.filter((item) => {
                        if (potonganStaffFilter !== "Semua" && item.karyawanId !== potonganStaffFilter) {
                          return false;
                        }
                        if (potonganStatusFilter !== "Semua" && item.status !== potonganStatusFilter) {
                          return false;
                        }
                        if (potonganSearch.trim()) {
                          const query = potonganSearch.toLowerCase();
                          const matchNama = (item.karyawanNama || "").toLowerCase().includes(query);
                          const matchAlasan = (item.alasan || "").toLowerCase().includes(query);
                          if (!matchNama && !matchAlasan) return false;
                        }
                        return true;
                      });

                      if (filteredList.length === 0) {
                        return (
                          <div className="bg-[#0A0A0B] border border-zinc-900 p-8 text-center rounded-lg text-zinc-500">
                            <Scissors className="w-8 h-8 mx-auto text-zinc-600 mb-2 opacity-60" />
                            <p className="text-sm font-bold text-zinc-400">Belum ada data potongan gaji</p>
                            <p className="text-xs mt-1">Gunakan formulir di atas untuk menambahkan potongan gaji tambahan baru beserta kolom alasannya.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="overflow-x-auto border border-zinc-900 rounded-lg">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-zinc-950 text-zinc-400 font-bold uppercase text-[10px] border-b border-zinc-800">
                                <th className="p-2.5 w-12 text-center">No</th>
                                <th className="p-2.5 w-28">Tanggal</th>
                                <th className="p-2.5">Karyawan</th>
                                <th className="p-2.5 w-32">Nominal (Rp)</th>
                                <th className="p-2.5 font-black text-rose-300">Kolom Alasan Pemotongan</th>
                                <th className="p-2.5 w-28 text-center">Status</th>
                                <th className="p-2.5 w-24 text-center">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900 font-mono">
                              {filteredList.map((item, idx) => (
                                <tr key={item.id} className="hover:bg-zinc-950/70 transition">
                                  <td className="p-2.5 text-center text-zinc-500">{idx + 1}</td>
                                  <td className="p-2.5 text-zinc-400 text-[11px] font-sans">{item.tanggal}</td>
                                  <td className="p-2.5 font-sans font-bold text-white text-[12px]">{item.karyawanNama}</td>
                                  <td className="p-2.5 font-bold text-rose-400 text-[12.5px]">- {formatIDR(item.jumlah)}</td>
                                  <td className="p-2.5 font-sans font-semibold text-rose-200 text-[12px] bg-rose-950/10">
                                    <div className="flex items-center gap-1.5">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                                      <span>{item.alasan}</span>
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-center font-sans">
                                    <button
                                      type="button"
                                      onClick={() => handleTogglePotonganStatus(item)}
                                      className={`px-2 py-0.5 text-[10px] font-black uppercase rounded border cursor-pointer transition ${
                                        item.status === "aktif"
                                          ? "bg-rose-950/80 border-rose-600 text-rose-300 hover:bg-rose-900"
                                          : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                                      }`}
                                      title="Klik untuk mengubah status potongan (Aktif / Sudah Dipotong)"
                                    >
                                      {item.status === "aktif" ? "Aktif" : "Selesai"}
                                    </button>
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePotonganGaji(item)}
                                      className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/50 rounded transition cursor-pointer"
                                      title="Hapus data potongan ini"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in text-left font-sans">
                  <div className="bg-[#121214] border border-[#27272A] p-4 text-left leading-relaxed">
                    <h4 className="text-[13px] font-black text-emerald-400 uppercase tracking-widest border-b border-[#27272A] pb-2 mb-4 flex items-center gap-1.5">
                      <History className="w-4 h-4 shrink-0 text-emerald-500" /> RIWAYAT PENCAIRAN GAJI INSTAN & BONUS STAF
                    </h4>

                    {/* Filter Section */}
                    <div className="bg-[#0A0A0B] border border-[#27272A] p-3 space-y-3 mb-4 rounded-none">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[11.5px] font-black uppercase text-zinc-400 block mb-1">Pilih Karyawan</label>
                          <select
                            value={disbRincianStaffFilter}
                            onChange={(e) => setDisbRincianStaffFilter(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-[12.5px] rounded-none font-bold cursor-pointer"
                          >
                            <option value="Semua">Semua Karyawan</option>
                            {karyawanList.map((st) => (
                              <option key={st.id} value={st.id}>{st.nama}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[11.5px] font-black uppercase text-zinc-400 block mb-1">Tipe Pencairan</label>
                          <select
                            value={disbRincianTypeFilter}
                            onChange={(e) => setDisbRincianTypeFilter(e.target.value as any)}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-[12.5px] rounded-none font-bold cursor-pointer"
                          >
                            <option value="Semua">Semua Tipe</option>
                            <option value="Gaji Awal">Gaji Awal / Instan</option>
                            <option value="Kasbon">Pemberian Kasbon</option>
                            <option value="Bonus">Bonus / Lembur</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11.5px] font-black uppercase text-zinc-400 block mb-1">Mulai Tanggal</label>
                          <input
                            type="date"
                            value={gajiStartDate}
                            onChange={(e) => setGajiStartDate(e.target.value)}
                            className="w-full bg-[#121214] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-[12.5px] rounded-none font-bold font-mono cursor-pointer"
                          />
                        </div>

                        <div>
                          <label className="text-[11.5px] font-black uppercase text-zinc-400 block mb-1">Sampai Tanggal</label>
                          <input
                            type="date"
                            value={gajiEndDate}
                            onChange={(e) => setGajiEndDate(e.target.value)}
                            className="w-full bg-[#121214] border border-[#27272A] text-white px-3 py-1.5 outline-none focus:border-emerald-500 text-[12.5px] rounded-none font-bold font-mono cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#27272A]/50">
                        <label className="text-[11.5px] font-black uppercase text-zinc-400 block mb-1">Cari Catatan / Keterangan / Nama</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Ketik kata kunci pencarian..."
                            value={disbRincianSearch}
                            onChange={(e) => setDisbRincianSearch(e.target.value)}
                            className="w-full bg-[#121214] border border-[#27272A] text-white pl-8 pr-12 py-1.5 outline-none focus:border-emerald-500 text-[12.5px] rounded-none font-mono"
                          />
                          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          {disbRincianSearch && (
                            <button
                              type="button"
                              onClick={() => setDisbRincianSearch("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white px-1 text-[11px] font-bold font-sans cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Statistics Cards */}
                    {(() => {
                      const relatedPencairanExpenses = (expenses || []).filter((exp) => {
                        const isBonusDisb = exp.pencairanBonus === true || 
                          (exp.category === "Gaji Karyawan" && 
                           exp.subCategory === "Bonus / Lembur" && 
                           exp.title.includes("Pencairan Bonus"));

                        const isGajiAwalDisb = exp.pencairanGaji === true ||
                          (exp.category === "Gaji Karyawan" &&
                           exp.subCategory === "Pencairan Gaji" &&
                           exp.title.includes("Pencairan Gaji"));

                        const isKasbon = exp.category === "Kasbon Karyawan";

                        if (!isBonusDisb && !isGajiAwalDisb && !isKasbon) return false;

                        if (disbRincianStaffFilter !== "Semua" && exp.karyawanId !== disbRincianStaffFilter) return false;
                        if (disbRincianTypeFilter === "Gaji Awal" && !isGajiAwalDisb) return false;
                        if (disbRincianTypeFilter === "Bonus" && !isBonusDisb) return false;
                        if (disbRincianTypeFilter === "Kasbon" && !isKasbon) return false;
                        if (gajiStartDate && exp.date < gajiStartDate) return false;
                        if (gajiEndDate && exp.date > gajiEndDate) return false;

                        if (disbRincianSearch.trim()) {
                          const searchLow = disbRincianSearch.toLowerCase();
                          const stafName = karyawanList.find(k => k.id === exp.karyawanId)?.nama?.toLowerCase() || "";
                          const titleLow = (exp.title || "").toLowerCase();
                          const notesLow = (exp.notes || "").toLowerCase();
                          const subCatLow = (exp.subCategory || "").toLowerCase();
                          const payMetLow = (exp.paymentMethod || "").toLowerCase();
                          if (!stafName.includes(searchLow) && !titleLow.includes(searchLow) && !notesLow.includes(searchLow) && !subCatLow.includes(searchLow) && !payMetLow.includes(searchLow)) {
                            return false;
                          }
                        }
                        return true;
                      });

                      const totalDisbGajiAwal = relatedPencairanExpenses
                        .filter(exp => exp.pencairanGaji === true || (exp.subCategory === "Pencairan Gaji" && exp.title.includes("Pencairan Gaji")))
                        .reduce((sum, exp) => sum + (exp.amount || 0), 0);

                      const totalDisbKasbon = relatedPencairanExpenses
                        .filter(exp => exp.category === "Kasbon Karyawan")
                        .reduce((sum, exp) => sum + (exp.amount || 0), 0);

                      const totalDisbBonus = relatedPencairanExpenses
                        .filter(exp => exp.pencairanBonus === true || (exp.subCategory === "Bonus / Lembur" && exp.title.includes("Pencairan Bonus")))
                        .reduce((sum, exp) => sum + (exp.amount || 0), 0);

                      return (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-[#0A0A0B] border border-amber-950/45 p-4 flex flex-col justify-between rounded-lg">
                              <span className="text-[11.5px] font-black uppercase text-amber-400 tracking-wider">Total Kasbon Diberikan</span>
                              <p className="text-[17px] sm:text-[19px] font-mono font-black text-amber-400 mt-1.5">{formatIDR(totalDisbKasbon)}</p>
                              <p className="text-[11px] text-zinc-400 mt-2 font-medium">Pinjaman kasbon langsung ke karyawan (tidak potong gaji otomatis)</p>
                            </div>

                            <div className="bg-[#0A0A0B] border border-emerald-950/45 p-4 flex flex-col justify-between rounded-lg">
                              <span className="text-[11.5px] font-black uppercase text-emerald-400 tracking-wider">Total Pencairan Bonus</span>
                              <p className="text-[17px] sm:text-[19px] font-mono font-black text-emerald-450 mt-1.5">{formatIDR(totalDisbBonus)}</p>
                              <p className="text-[11px] text-zinc-400 mt-2 font-medium">Mengurangi reward pending bonus staf dari sistem</p>
                            </div>
                          </div>

                          {/* List of transaction rows */}
                          <div className="bg-[#0A0A0B] border border-[#27272A] rounded-lg overflow-hidden shrink-0 mt-2">
                            <div className="bg-[#121214] border-b border-[#27272A] px-4 py-3 flex justify-between items-center flex-wrap gap-2">
                              <h5 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">RIWAYAT ALIRAN PENCAIRAN ({relatedPencairanExpenses.length} TRANSAKSI)</h5>
                              <span className="text-[8.5px] font-mono text-zinc-500">Filter aktif: {disbRincianStaffFilter === "Semua" ? "Semua Staf" : "Staf Pilihan"} | {disbRincianTypeFilter}</span>
                            </div>

                            {relatedPencairanExpenses.length === 0 ? (
                              <div className="p-12 text-center text-zinc-500 font-mono text-xs">
                                Tidak ada catatan riwayat transaksi pencairan yang cocok dengan filter tanggal/staf saat ini.
                              </div>
                            ) : (
                              <div className="divide-y divide-[#27272A]">
                                {relatedPencairanExpenses.map((exp) => {
                                  const isBonus = exp.pencairanBonus === true || exp.subCategory?.toLowerCase().includes("bonus") || exp.title?.toLowerCase().includes("bonus");
                                  const isKasbon = exp.category === "Kasbon Karyawan";
                                  const stafNama = karyawanList.find(k => k.id === exp.karyawanId)?.nama || "Staf Tidak Dikenal";
                                  return (
                                    <div key={exp.id} className="p-5 hover:bg-zinc-900/30 transition flex flex-col space-y-4 text-xs font-sans text-left">
                                      {/* TOP Row: Employee Name + Date & Meta Tags */}
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                                        <div>
                                          <p className="text-zinc-100 text-base font-extrabold flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${isBonus ? "bg-emerald-500" : isKasbon ? "bg-amber-500" : "bg-sky-500"}`}></span>
                                            {stafNama}
                                          </p>
                                        </div>
                                        
                                        {/* Tags Row */}
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className={`text-[9px] font-black px-2.5 py-1 tracking-wider uppercase border rounded-md shadow-sm ${
                                            isBonus ? "bg-emerald-950/50 text-emerald-350 border-emerald-800/60" : isKasbon ? "bg-amber-950/50 text-amber-300 border-amber-800/60" : "bg-sky-950/50 text-sky-350 border-sky-800/60"
                                          }`}>
                                            {isBonus ? "🎁 BONUS" : isKasbon ? "💼 KASBON" : "💸 GAJI AWAL"}
                                          </span>
                                          <span className="text-[9.5px] font-mono text-zinc-200 font-extrabold bg-[#121214] border border-zinc-850 px-2.5 py-1 rounded-md">
                                            📅 {exp.date}
                                          </span>
                                          <span className="text-[9.5px] text-zinc-200 font-extrabold bg-[#121214] border border-zinc-850 px-2.5 py-1 rounded-md">
                                            💳 {exp.paymentMethod}
                                          </span>
                                        </div>
                                      </div>

                                      {/* MIDDLE Row: Notes, clearly presented with robust contrast */}
                                      <div className="text-[11.5px] leading-relaxed">
                                        {exp.notes ? (
                                          <div className="bg-zinc-950 border border-zinc-850 p-3 text-zinc-200 rounded-md">
                                            <span className="text-zinc-400 font-black mr-1 uppercase text-[9px] block mb-1">Catatan Transaksi / Keterangan:</span>
                                            <span className="font-mono text-zinc-105 select-all">{exp.notes}</span>
                                          </div>
                                        ) : (
                                          <span className="text-zinc-500 italic">Tanpa catatan pengeluaran.</span>
                                        )}
                                      </div>

                                      {/* BOTTOM Row: Amount & Cancel Action */}
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-1 gap-3">
                                        <div className="bg-zinc-950/50 border border-zinc-900 px-3 py-2 rounded-md flex items-center gap-2">
                                          <div className="text-left">
                                            <p className="text-[8.5px] font-black uppercase text-zinc-400 tracking-wider">NOMINAL DICAIRKAN</p>
                                            <span className={`text-lg font-mono font-black ${isBonus ? "text-emerald-400" : isKasbon ? "text-amber-400" : "text-sky-400"}`}>
                                              {formatIDR(exp.amount || 0)}
                                            </span>
                                          </div>
                                        </div>

                                        <div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (isBonus) {
                                                handleDeleteBonusDisbursement(exp);
                                              } else {
                                                handleCancelPencairanGaji(exp);
                                              }
                                            }}
                                            className="w-full sm:w-auto px-4 py-2.5 bg-red-950/20 hover:bg-red-900/80 hover:text-white border border-red-900/50 hover:border-red-500 text-red-400 font-black text-[10.5px] uppercase tracking-wide cursor-pointer transition rounded-md flex items-center justify-center gap-1.5 shrink-0 shadow-sm"
                                            title="Batalkan transaksi ini dan kembalikan ke kas"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>BATALKAN TRANSAKSI</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

            </div>
          )}
           {/* TAB 5: LOKASI LAT/LONG & TEMPLATE NOTA CONFIGURATION */}
          {panelTab === "lokasi" && (
            <div className="space-y-4 text-left">
              
              <form onSubmit={handleSaveLocation} className="bg-[#121214] border border-[#27272A] p-4 space-y-4 font-sans text-xs animate-fade-in">
                <h4 className="text-[10.5px] font-black text-emerald-500 uppercase tracking-widest border-b border-[#27272A] pb-2">
                  KONFIGURASI UTAMA OUTLET & NOTA WHATSAPP
                </h4>
                
                <p className="text-[10px] text-zinc-400 font-bold leading-relaxed">
                  Konfigurasikan informasi identitas outlet fisik Anda beserta draf ketentuan transaksi. Data di bawah digunakan secara otomatis untuk menyusun struk cetak thermal dan pesan WhatsApp pelanggan.
                </p>

                <div className="space-y-3.5 font-semibold text-zinc-300">
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Nama Outlet / Laundry</label>
                    <input
                      type="text"
                      required
                      value={locationConfig.namaLokasi}
                      onChange={(e) => setLocationConfig(prev => ({ ...prev, namaLokasi: e.target.value }))}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs font-bold font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Alamat Lengkap Outlet</label>
                    <input
                      type="text"
                      placeholder="Contoh: Jagakarsa, Kota Jakarta Selatan"
                      value={locationConfig.alamatLokasi || ""}
                      onChange={(e) => setLocationConfig(prev => ({ ...prev, alamatLokasi: e.target.value }))}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs font-bold font-sans"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">No Telepon Outlet / WA</label>
                      <input
                        type="text"
                        placeholder="Contoh: 085743031695"
                        value={locationConfig.teleponLokasi || ""}
                        onChange={(e) => setLocationConfig(prev => ({ ...prev, teleponLokasi: e.target.value }))}
                        className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs font-bold font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Jam Buka / Operasional</label>
                      <input
                        type="text"
                        placeholder="Contoh: 07.30 - 21.00"
                        value={locationConfig.jamBukaLokasi || ""}
                        onChange={(e) => setLocationConfig(prev => ({ ...prev, jamBukaLokasi: e.target.value }))}
                        className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs font-bold font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Ketentuan Transaksi (Pada Nota WA)</label>
                    <textarea
                      rows={5}
                      placeholder="Masukkan poin-poin ketentuan..."
                      value={locationConfig.ketentuanNota || ""}
                      onChange={(e) => setLocationConfig(prev => ({ ...prev, ketentuanNota: e.target.value }))}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 rounded-none text-xs font-sans leading-relaxed"
                    />
                    <p className="text-[8.5px] text-zinc-550 leading-tight mt-1">
                      Gunakan baris baru (Enter) untuk memisahkan setiap nomor ketentuan. Data ini akan ditampilkan pada bagian bawah pesan WhatsApp pelanggan.
                    </p>
                  </div>

                  <div className="border-t border-zinc-900 pt-3">
                    <span className="text-[9px] font-black text-[#0ea5e9] uppercase tracking-widest block mb-2">KONFIGURASI PRESEISI GPS (ABSENSI PEGAWAI)</span>
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
                    {savingLocation ? "MEMPERBARUI..." : "SIMPAN KONFIGURASI OUTLET"}
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

              {/* 🚀 INFORMASI & KONTROL PEMBARUAN SISTEM (UPDATE SYSTEM) */}
              <div className="mt-6 pt-5 border-t border-[#27272A] bg-[#121214] border border-amber-500/40 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
                      <Rocket className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">
                        Pembaruan Sistem Aplikasi
                      </h4>
                      <p className="text-[10px] text-zinc-400">
                        Kontrol notifikasi pembaruan otomatis untuk semua perangkat staf &amp; admin
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-bold bg-amber-500 text-black px-2 py-0.5">
                    v1.4.2
                  </span>
                </div>

                <p className="text-[11px] text-zinc-300 leading-relaxed mb-3">
                  Aplikasi secara otomatis mendeteksi saat ada rilis versi baru dan memunculkan popup kecil di layar pengguna untuk memuat ulang aplikasi. Anda juga dapat menyiarkan sinyal pembaruan secara instan ke seluruh HP karyawan yang sedang aktif membuka sistem.
                </p>

                {lastBroadcastStatus && (
                  <div className="mb-3 p-2.5 bg-emerald-950/40 border border-emerald-500/60 text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fade-in">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{lastBroadcastStatus}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBroadcastSystemUpdate}
                    disabled={broadcastingUpdate}
                    className="flex-1 py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-[11px] tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                  >
                    <Radio className={`w-4 h-4 ${broadcastingUpdate ? "animate-pulse" : ""}`} />
                    <span>{broadcastingUpdate ? "Menyiarkan Notifikasi..." : "Siarkan Notifikasi Update ke Semua HP"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="py-2.5 px-4 bg-zinc-950 hover:bg-zinc-900 border border-[#27272A] text-zinc-300 hover:text-white font-bold uppercase text-[11px] flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Muat Ulang Aplikasi</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ✂️ MODAL DIALOG POTONG KASBON MANUAL */}
      {activeDeductKaryawanId && (() => {
        const targetStaf = karyawanList.find(k => k.id === activeDeductKaryawanId);
        if (!targetStaf) return null;
        const currentKasbonVal = stafKasbon[activeDeductKaryawanId] !== undefined ? stafKasbon[activeDeductKaryawanId] : (targetStaf.kasbon || 0);
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-[999] p-4 text-left font-sans">
            <div className="bg-white border border-zinc-200 w-full max-w-sm p-5 space-y-4 shadow-2xl rounded-lg">
              <div className="border-b border-zinc-100 pb-3">
                <h4 className="text-[10px] font-black uppercase text-amber-600 tracking-wider">✂️ POTONG SALDO KASBON MANUAL</h4>
                <p className="text-zinc-900 text-lg font-extrabold mt-1">{targetStaf.nama}</p>
              </div>

              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-xs font-sans text-zinc-600 bg-amber-50 px-3 py-2 border border-amber-100 rounded-md">
                  <span className="font-medium">Saldo Kasbon Saat Ini:</span>
                  <span className="font-extrabold text-amber-700 text-sm">{formatIDR(currentKasbonVal)}</span>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase block">Jumlah Potongan (Rp)</label>
                  <input
                    type="text"
                    required
                    placeholder="Nominal, misal: 100.000"
                    value={deductKasbonInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setDeductKasbonInput(val ? formatRupiah(val) : "");
                    }}
                    className="w-full bg-white border border-zinc-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-550/20 text-zinc-950 font-mono px-3 py-2 outline-none rounded-md text-sm transition-all shadow-inner"
                    autoFocus
                  />
                  {deductKasbonInput ? (
                    <p className="text-[10.5px] text-zinc-600 italic mt-1.5 font-sans">
                      Akan memotong kasbon sebanyak: <span className="font-extrabold text-amber-600">{formatIDR(parseRupiah(deductKasbonInput))}</span>
                    </p>
                  ) : (
                    <p className="text-[9.5px] text-zinc-400 mt-1 font-sans">
                      Ketik angka potongan, tanda titik pemisah ribuan akan ditambahkan otomatis.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase block">Keterangan Pemotongan (Opsional)</label>
                  <input
                    type="text"
                    placeholder="Misal: Cicilan dipotong tunai di kasir"
                    value={deductKasbonNotes}
                    onChange={(e) => setDeductKasbonNotes(e.target.value)}
                    className="w-full bg-white border border-zinc-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-550/20 text-zinc-950 px-3 py-2 outline-none rounded-md text-sm transition-all shadow-inner font-sans"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => {
                    setActiveDeductKaryawanId(null);
                    setDeductKasbonInput("");
                    setDeductKasbonNotes("");
                  }}
                  className="px-4 py-2 hover:bg-zinc-50 text-zinc-500 hover:text-zinc-800 border border-zinc-200 text-[10.5px] font-bold uppercase transition rounded-md"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const amount = parseRupiah(deductKasbonInput);
                    handleDeductKasbonManual(activeDeductKaryawanId, amount, deductKasbonNotes);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-[10.5px] font-extrabold uppercase transition rounded-md shadow-md shadow-amber-600/10"
                >
                  Potong Kasbon
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 📋 MODAL RIWAYAT KASBON KARYAWAN */}
      {activeHistoryKaryawanId && (() => {
        const targetStaf = karyawanList.find(k => k.id === activeHistoryKaryawanId);
        if (!targetStaf) return null;
        
        // Filter history list for this employee
        const rawHistoryList = kasbonHistoryList.filter(h => h.karyawanId === activeHistoryKaryawanId);
        const currentKasbonVal = stafKasbon[activeHistoryKaryawanId] !== undefined ? stafKasbon[activeHistoryKaryawanId] : (targetStaf.kasbon || 0);

        // Compute running balance after each transaction (from newest to oldest)
        let runningBalance = currentKasbonVal;
        const historyList = rawHistoryList.map((hist) => {
          const saldoSetelahnya = runningBalance;
          if (hist.tipe === "penambahan") {
            runningBalance = Math.max(0, runningBalance - hist.jumlah);
          } else {
            runningBalance = runningBalance + hist.jumlah;
          }
          return { ...hist, saldoSetelahnya };
        });

        // Summary figures
        const totalPinjamanModal = rawHistoryList
          .filter(h => h.tipe === "penambahan")
          .reduce((sum, h) => sum + (h.jumlah || 0), 0);
        const totalPotonganModal迷 = rawHistoryList
          .filter(h => h.tipe === "pengurangan")
          .reduce((sum, h) => sum + (h.jumlah || 0), 0);
        const saldoAwalModal = Math.max(0, currentKasbonVal - totalPinjamanModal + totalPotonganModal迷);

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white border border-zinc-200 w-full max-w-lg p-6 space-y-4 shadow-2xl rounded-xl">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-blue-600 tracking-wider">📋 RIWAYAT ALOKASI & PEMOTONGAN KASBON</h4>
                  <p className="text-zinc-900 text-xl font-extrabold mt-0.5">{targetStaf.nama}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveHistoryKaryawanId(null)}
                  className="text-zinc-400 hover:text-zinc-600 font-bold transition duration-150 p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Summary cards with Saldo Awal, Pinjaman, Pelunasan, and Saldo Aktif */}
              <div className="grid grid-cols-4 gap-2 bg-zinc-50 border border-zinc-200 p-2.5 rounded-lg text-xs font-sans">
                <div className="p-1.5 bg-white border border-zinc-150 rounded">
                  <p className="text-[9px] uppercase font-bold text-zinc-500">Saldo Awal</p>
                  <p className="text-xs font-black text-zinc-800 mt-0.5">{formatIDR(saldoAwalModal)}</p>
                </div>
                <div className="p-1.5 bg-blue-50/60 border border-blue-150 rounded">
                  <p className="text-[9px] uppercase font-bold text-blue-700">Pinjaman (+)</p>
                  <p className="text-xs font-black text-blue-700 mt-0.5">{formatIDR(totalPinjamanModal)}</p>
                </div>
                <div className="p-1.5 bg-rose-50/60 border border-rose-150 rounded">
                  <p className="text-[9px] uppercase font-bold text-rose-700">Pelunasan (-)</p>
                  <p className="text-xs font-black text-rose-700 mt-0.5">{formatIDR(totalPotonganModal迷)}</p>
                </div>
                <div className="p-1.5 bg-amber-50/60 border border-amber-200 rounded text-right">
                  <p className="text-[9px] uppercase font-bold text-amber-800">Saldo Aktif</p>
                  <p className="text-xs font-black text-amber-700 mt-0.5">{formatIDR(currentKasbonVal)}</p>
                </div>
              </div>

              {/* History list */}
              <div className="max-h-[320px] overflow-y-auto border border-zinc-100 rounded-lg divide-y divide-zinc-100 bg-zinc-50/50">
                {historyList.length === 0 ? (
                  <div className="p-8 text-center text-zinc-400 italic text-xs font-sans space-y-2">
                    <p className="text-sm">📭 Belum ada riwayat kasbon.</p>
                    <p className="text-[10.5px] text-zinc-400 font-normal">Seluruh pencatatan kasbon baru, pemotongan manual, maupun pemotongan otomatis saat gajian akan terekam secara otomatis di sini.</p>
                  </div>
                ) : (
                  historyList.map((hist) => {
                    const isAdd = hist.tipe === "penambahan";
                    return (
                      <div key={hist.id} className="p-3.5 flex items-start gap-3 hover:bg-zinc-50 transition duration-75">
                        <div className={`p-1.5 rounded-lg mt-0.5 flex-shrink-0 ${
                          isAdd ? "bg-blue-50 text-blue-600 border border-blue-200" : "bg-rose-50 text-rose-600 border border-rose-200"
                        }`}>
                          {isAdd ? <Plus className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </div>
                        <div className="flex-grow space-y-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-black uppercase ${
                              isAdd ? "text-blue-700" : "text-rose-700"
                            }`}>
                              {isAdd ? "Penambahan Kasbon (+)" : "Potong / Pelunasan (-)"}
                            </span>
                            <span className="text-[10.5px] font-mono text-zinc-400 font-semibold">{hist.tanggal}</span>
                          </div>

                          {/* Total kasbon saat ini setelah transaksi */}
                          <p className="text-[11px] text-zinc-500 font-medium leading-tight">
                            total kasbon saat ini adalah <span className="font-bold text-zinc-900">{formatIDR(hist.saldoSetelahnya)}</span>
                          </p>

                          <p className="text-zinc-800 text-[12.5px] font-semibold leading-relaxed pt-0.5">
                            {hist.keterangan || "-"}
                          </p>

                          <div className="flex items-center justify-between pt-1 border-t border-zinc-100/80 mt-1">
                            <span className="text-[10px] text-zinc-400 font-mono">ID: {hist.id}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-black font-mono ${
                                isAdd ? "text-blue-600" : "text-rose-600"
                              }`}>
                                {isAdd ? "+" : "-"} {formatIDR(hist.jumlah)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteKasbonHistory(hist)}
                                className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition duration-150 cursor-pointer"
                                title="Hapus riwayat ini & kembalikan saldo kasbon"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Actions: Download PDF, Excel / CSV, and Close */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-100 font-sans">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      exportKasbonSinglePDF({
                        karyawan: targetStaf,
                        historyList,
                        currentKasbon: currentKasbonVal,
                        outletName: locationConfig.namaLokasi || "Clean & Fresh Laundry"
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] rounded-lg tracking-wider uppercase transition duration-150 cursor-pointer shadow-xs"
                    title="Unduh laporan resmi riwayat kasbon format PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      exportKasbonSingleCSV({
                        karyawan: targetStaf,
                        historyList,
                        currentKasbon: currentKasbonVal,
                        outletName: locationConfig.namaLokasi || "Clean & Fresh Laundry"
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] rounded-lg tracking-wider uppercase transition duration-150 cursor-pointer shadow-xs"
                    title="Unduh data mutasi kasbon format Spreadsheet Excel/CSV"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Download Excel / CSV</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveHistoryKaryawanId(null)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-black text-[11px] rounded-lg tracking-wider uppercase transition duration-150 cursor-pointer"
                >
                  Tutup Riwayat
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 💵 MODAL RIWAYAT GAJIAN & POTONGAN KARYAWAN */}
      {activeGajiHistoryKaryawanId && (() => {
        const targetStaf = karyawanList.find(k => k.id === activeGajiHistoryKaryawanId);
        if (!targetStaf) return null;

        // Filter salary payout expenses for this employee
        const gajiHistoryList = (expenses || []).filter((exp) => {
          if (exp.category !== "Gaji Karyawan") return false;
          if (exp.karyawanId === targetStaf.id) return true;
          const nameLow = (targetStaf.nama || "").toLowerCase();
          const titleLow = (exp.title || "").toLowerCase();
          const notesLow = (exp.notes || "").toLowerCase();
          return titleLow.includes(nameLow) || notesLow.includes(nameLow);
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const totalGajiPaid = gajiHistoryList.reduce((acc, curr) => acc + curr.amount, 0);

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white border border-zinc-200 w-full max-w-xl p-6 space-y-4 shadow-2xl rounded-xl">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-emerald-600 tracking-wider flex items-center gap-1">
                    💵 RIWAYAT GAJIAN & POTONGAN GAJI STAF
                  </h4>
                  <p className="text-zinc-900 text-xl font-extrabold mt-0.5">{targetStaf.nama}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveGajiHistoryKaryawanId(null)}
                  className="text-zinc-400 hover:text-zinc-600 font-bold transition duration-150 p-1 cursor-pointer text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Summary card */}
              <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-lg flex justify-between items-center text-xs font-sans">
                <div>
                  <p className="text-[10px] uppercase font-extrabold text-emerald-800">Total Payout Gaji Dibayarkan</p>
                  <p className="text-xl font-black text-emerald-700 mt-0.5">{formatIDR(totalGajiPaid)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase font-extrabold text-emerald-800">Total Transaksi</p>
                  <p className="text-lg font-black text-zinc-800 mt-0.5">{gajiHistoryList.length} Kali Payout</p>
                </div>
              </div>

              {/* History list */}
              <div className="max-h-[360px] overflow-y-auto border border-zinc-150 rounded-lg divide-y divide-zinc-100 bg-zinc-50/50">
                {gajiHistoryList.length === 0 ? (
                  <div className="p-8 text-center text-zinc-400 italic text-xs font-sans space-y-2">
                    <p className="text-sm font-semibold text-zinc-500">📭 Belum ada riwayat gajian untuk {targetStaf.nama}.</p>
                    <p className="text-[10.5px] text-zinc-400 font-normal">
                      Seluruh transaksi pembayaran gaji mingguan beserta rincian potongan (seperti terlambat/pulang awal) akan otomatis tercatat di sini.
                    </p>
                  </div>
                ) : (
                  gajiHistoryList.map((exp) => {
                    const hasDeduction = exp.notes?.includes("Potong Gaji") || exp.notes?.includes("Potongan") || exp.notes?.includes("Terlambat") || exp.notes?.includes("Pulang");
                    return (
                      <div key={exp.id} className="p-3.5 space-y-2 hover:bg-zinc-100/50 transition duration-75">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-zinc-900">{exp.title}</span>
                          <span className="text-[10.5px] font-mono text-zinc-600 font-bold bg-zinc-200/70 px-2 py-0.5 rounded">{exp.date}</span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-600">Metode: <strong className="text-zinc-800">{exp.paymentMethod || "Transfer"}</strong></span>
                          <div className="text-right">
                            <span className="text-zinc-400 text-[11px] font-medium mr-1">Payout Net:</span>
                            <span className="text-base font-black font-mono text-emerald-600">{formatIDR(exp.amount)}</span>
                          </div>
                        </div>

                        {exp.notes && (
                          <div className={`p-2.5 rounded-lg text-[11.5px] font-sans leading-relaxed ${
                            hasDeduction ? "bg-amber-50 border border-amber-200 text-amber-950 font-medium" : "bg-white border border-zinc-200 text-zinc-700"
                          }`}>
                            {exp.notes}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-zinc-100 text-xs">
                          <button
                            type="button"
                            onClick={() => downloadHistoricSlipGaji(exp, targetStaf)}
                            className="px-2.5 py-1 text-[10.5px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition cursor-pointer flex items-center gap-1 shadow-xs"
                          >
                            <Download className="w-3 h-3" /> Download Slip PDF
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm(`Apakah Anda yakin ingin menghapus catatan riwayat gajian ini (${formatIDR(exp.amount)})?`)) {
                                try {
                                  await deleteDoc(doc(db, "users", ownerId, "expenses", exp.id));
                                  alert("Catatan gajian berhasil dihapus.");
                                } catch (err) {
                                  console.error("Gagal menghapus catatan gaji:", err);
                                  alert("Gagal menghapus catatan gaji.");
                                }
                              }
                            }}
                            className="px-2 py-1 text-[10.5px] font-bold text-rose-600 hover:bg-rose-50 rounded border border-rose-200 transition cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Hapus
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setActiveGajiHistoryKaryawanId(null)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-black text-[11px] rounded-lg tracking-wider uppercase transition duration-150 cursor-pointer"
                >
                  Tutup Riwayat
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ✂️ MODAL CEPAT TAMBAH POTONGAN GAJI TAMBAHAN (DENGAN KOLOM ALASAN) */}
      {activeAddPotonganKaryawanId && (() => {
        const targetStaf = karyawanList.find(k => k.id === activeAddPotonganKaryawanId);
        if (!targetStaf) return null;

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#121214] border border-[#27272A] p-5 max-w-lg w-full rounded-xl space-y-4 text-left shadow-2xl animate-fade-in font-sans">
              <div className="flex items-center justify-between border-b border-[#27272A] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-rose-950/70 border border-rose-800/80 rounded-lg text-rose-400">
                    <Scissors className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-black uppercase tracking-wider text-rose-400">
                      Tambah Potongan Gaji Tambahan
                    </h3>
                    <p className="text-[11.5px] text-zinc-300 font-bold">
                      Karyawan: <span className="text-white font-extrabold">{targetStaf.nama}</span> ({targetStaf.posisi})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveAddPotonganKaryawanId(null)}
                  className="text-zinc-500 hover:text-white p-1 text-lg font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="bg-rose-950/20 border border-rose-900/40 p-3 rounded-lg text-xs text-rose-300 space-y-1">
                <p className="font-bold">ℹ️ Info Pemotongan Otomatis:</p>
                <p className="text-[11px] text-zinc-300">
                  Potongan yang ditambahkan di sini berstatus <strong>Aktif</strong> dan otomatis mengurangi perhitungan gaji bersih mingguan staf pada slip gaji dan proses payroll.
                </p>
              </div>

              <div className="space-y-3">
                {/* Nominal Potongan */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-300 uppercase block mb-1">
                    Nominal Potongan (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 50.000"
                    value={modalPotonganAmount ? formatRupiah(modalPotonganAmount) : ""}
                    onChange={(e) => setModalPotonganAmount(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-[#0A0A0B] border border-zinc-800 focus:border-rose-500 text-rose-400 font-mono font-bold px-3 py-2 text-sm outline-none rounded"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {[10000, 20000, 25000, 50000, 100000].map((nominal) => (
                      <button
                        key={nominal}
                        type="button"
                        onClick={() => setModalPotonganAmount(nominal.toString())}
                        className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-[10.5px] font-mono text-zinc-300 hover:text-white rounded border border-zinc-800 cursor-pointer"
                      >
                        +{nominal >= 1000 ? `${nominal / 1000}rb` : nominal}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tanggal Potongan */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-300 uppercase block mb-1">
                    Tanggal Potongan
                  </label>
                  <input
                    type="date"
                    value={modalPotonganTanggal}
                    onChange={(e) => setModalPotonganTanggal(e.target.value)}
                    className="w-full bg-[#0A0A0B] border border-zinc-800 focus:border-rose-500 text-white font-mono px-3 py-2 text-[12.5px] outline-none rounded cursor-pointer"
                  />
                </div>

                {/* KOLOM ALASAN */}
                <div>
                  <label className="text-[11px] font-bold text-rose-300 uppercase block mb-1">
                    Kolom Alasan Pemotongan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ketik alasan spesifik (misal: Terlambat 30 menit / Pakaian robek)"
                    value={modalPotonganAlasan}
                    onChange={(e) => setModalPotonganAlasan(e.target.value)}
                    className="w-full bg-[#0A0A0B] border border-rose-950 focus:border-rose-500 text-rose-100 px-3 py-2 text-[12.5px] outline-none rounded placeholder:text-zinc-600"
                  />

                  {/* Preset Alasan */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {[
                      "⏱️ Terlambat Masuk",
                      "👕 Kerusakan Cucian",
                      "👔 Pelanggaran SOP",
                      "🚪 Pulang Lebih Awal",
                      "❌ Izin Tanpa Konfirmasi",
                      "💸 Selisih Kasir"
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setModalPotonganAlasan(preset)}
                        className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer transition ${
                          modalPotonganAlasan === preset
                            ? "bg-rose-950/70 border-rose-600 text-rose-200 font-bold"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#27272A]">
                <button
                  type="button"
                  onClick={() => setActiveAddPotonganKaryawanId(null)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-[11.5px] rounded uppercase cursor-pointer transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cleanNum = Number(modalPotonganAmount);
                    if (!cleanNum || cleanNum <= 0) {
                      alert("Silakan masukkan nominal potongan yang valid.");
                      return;
                    }
                    if (!modalPotonganAlasan.trim()) {
                      alert("Kolom alasan wajib diisi.");
                      return;
                    }
                    handleSavePotonganGaji(
                      targetStaf.id,
                      cleanNum,
                      modalPotonganAlasan.trim(),
                      modalPotonganTanggal
                    );
                    setModalPotonganAmount("");
                    setModalPotonganAlasan("");
                    setActiveAddPotonganKaryawanId(null);
                  }}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-[11.5px] rounded uppercase cursor-pointer transition shadow-md shadow-rose-900/30 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Simpan Potongan
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
