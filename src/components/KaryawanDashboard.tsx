import React, { useState, useEffect } from "react";
import { MapPin, CheckCircle, Clock, Calendar, LogOut, FileText, Send, AlertTriangle, RefreshCw, Download, Trash2, Sun, Sunset, RotateCw, Sparkles, FileSpreadsheet, Plus, Check, History, Coffee } from "lucide-react";
import { Karyawan, Absensi, Izin, LocationConfig, Expense, ShiftSettings, KasbonHistory } from "../types";
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, getDoc, query, where } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { jsPDF } from "jspdf";
import { 
  DEFAULT_SHIFT_SETTINGS, 
  calculateEmployeeShift, 
  getMondayOfDate, 
  getNextWeekMonday, 
  formatWeekRange 
} from "../utils/shiftUtils";
import { 
  exportKasbonSinglePDF, 
  exportKasbonSingleCSV, 
  enrichKasbonHistory 
} from "../utils/kasbonExport";
import { ShiftHistoryView } from "./ShiftHistoryView";

interface KaryawanDashboardProps {
  karyawan: Karyawan;
  ownerId: string;
  defaultLocation: LocationConfig;
  onLogout: () => void;
}

export function KaryawanDashboard({
  karyawan,
  ownerId,
  defaultLocation,
  onLogout
}: KaryawanDashboardProps) {
  const [activeTab, setActiveTab] = useState<"absen" | "izin" | "slip">("absen");
  const [locationConfig, setLocationConfig] = useState<LocationConfig>(defaultLocation);
  const [useSimulation, setUseSimulation] = useState<boolean>(true);
  const [showShiftHistoryModal, setShowShiftHistoryModal] = useState<boolean>(false);
  
  const [stafData, setStafData] = useState<Karyawan>(karyawan);
  const [shiftSettings, setShiftSettings] = useState<ShiftSettings>(DEFAULT_SHIFT_SETTINGS);

  useEffect(() => {
    const docRef = doc(db, "users", ownerId, "karyawan", karyawan.id);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setStafData(snap.data() as Karyawan);
      }
    });
    return unsub;
  }, [ownerId, karyawan.id]);

  useEffect(() => {
    const shiftRef = doc(db, "users", ownerId, "settings", "shift");
    const unsub = onSnapshot(shiftRef, (snap) => {
      if (snap.exists()) {
        setShiftSettings({
          ...DEFAULT_SHIFT_SETTINGS,
          ...snap.data()
        } as ShiftSettings);
      }
    });
    return unsub;
  }, [ownerId]);

  const currentMonday = getMondayOfDate(new Date());
  const nextMonday = getNextWeekMonday(new Date());
  const currentShiftInfo = calculateEmployeeShift(stafData, currentMonday, shiftSettings);
  const nextShiftInfo = calculateEmployeeShift(stafData, nextMonday, shiftSettings);
  
  // Geolocation states
  const [myCoords, setMyCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geoLoading, setGeoLoading] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  // Lists states
  const [absensiToday, setAbsensiToday] = useState<Absensi | null>(null);
  const [myAbsensiList, setMyAbsensiList] = useState<Absensi[]>([]);
  const [myIzinList, setMyIzinList] = useState<Izin[]>([]);
  
  // Leave request state
  const [leaveStartDate, setLeaveStartDate] = useState<string>("");
  const [leaveEndDate, setLeaveEndDate] = useState<string>("");
  const [leaveReason, setLeaveReason] = useState<string>("");
  const [leaveLoading, setLeaveLoading] = useState<boolean>(false);
  const [leaveSuccess, setLeaveSuccess] = useState<string | null>(null);

  // Gaji filter states
  const [stafGajiStartDate, setStafGajiStartDate] = useState<string>("");
  const [stafGajiEndDate, setStafGajiEndDate] = useState<string>("");

  // History filter states
  const [historyStartDate, setHistoryStartDate] = useState<string>("");
  const [historyEndDate, setHistoryEndDate] = useState<string>("");

  // Payroll history state for employee
  const [stafPayrollHistory, setStafPayrollHistory] = useState<Expense[]>([]);

  // Kasbon history state for employee
  const [myKasbonHistory, setMyKasbonHistory] = useState<KasbonHistory[]>([]);
  const [showKasbonModal, setShowKasbonModal] = useState<boolean>(false);

  useEffect(() => {
    if (!ownerId || !karyawan.id) return;
    const kasHistRef = collection(db, "users", ownerId, "kasbon_history");
    const unsub = onSnapshot(kasHistRef, (snap) => {
      const all: KasbonHistory[] = [];
      snap.forEach((d) => {
        const item = d.data() as KasbonHistory;
        if (item.karyawanId === karyawan.id) {
          all.push(item);
        }
      });
      all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setMyKasbonHistory(all);
    }, (err) => {
      console.error("Error loading kasbon history for employee:", err);
    });
    return unsub;
  }, [ownerId, karyawan.id]);

  useEffect(() => {
    if (!ownerId) return;
    const q = query(
      collection(db, "users", ownerId, "expenses"),
      where("category", "==", "Gaji Karyawan")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: Expense[] = [];
      snap.forEach((doc) => {
        list.push({ ...doc.data(), id: doc.id } as Expense);
      });
      setStafPayrollHistory(list);
    }, (err) => {
      console.error("Error loading payroll history for employee:", err);
    });
    return unsub;
  }, [ownerId]);

  const filteredHistoryAbsensi = myAbsensiList.filter((a) => {
    if (historyStartDate && a.tanggal < historyStartDate) return false;
    if (historyEndDate && a.tanggal > historyEndDate) return false;
    return true;
  });

  // Haversine formula
  const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  // 1. Fetch Location Config from Firestore settings
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

  // 2. Fetch Personal Absensi & Izin arrays real-time
  useEffect(() => {
    const absRef = collection(db, "users", ownerId, "absensi");
    const unsubAbs = onSnapshot(absRef, (snap) => {
      const all: Absensi[] = [];
      snap.forEach((d) => {
        const item = d.data() as Absensi;
        if (item.karyawanId === karyawan.id) {
          all.push(item);
        }
      });
      // Sort by date desc
      all.sort((a, b) => (b.checkInTime || "").localeCompare(a.checkInTime || ""));
      setMyAbsensiList(all);

      // Check if logged in today
      const todayYMD = new Date().toISOString().substring(0, 10);
      const todayRecord = all.find((r) => r.tanggal === todayYMD);
      setAbsensiToday(todayRecord || null);
    });

    const izRef = collection(db, "users", ownerId, "izin");
    const unsubIz = onSnapshot(izRef, (snap) => {
      const all: Izin[] = [];
      snap.forEach((d) => {
        const item = d.data() as Izin;
        if (item.karyawanId === karyawan.id) {
          all.push(item);
        }
      });
      all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setMyIzinList(all);
    });

    return () => {
      unsubAbs();
      unsubIz();
    };
  }, [ownerId, karyawan.id]);

  // 3. Keep updating Geolocation on mount/refresh
  const getMyLocation = () => {
    if (useSimulation) {
      setGeoLoading(true);
      setTimeout(() => {
        setMyCoords({ latitude: locationConfig.latitude, longitude: locationConfig.longitude });
        setDistance(0);
        setGeoError(null);
        setGeoLoading(false);
      }, 500);
      return;
    }

    setGeoLoading(true);
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Geolocation tidak didukung oleh browser Anda.");
      setGeoLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setMyCoords({ latitude: lat, longitude: lon });
        
        // Calculate distance in meters
        const dist = getDistanceInMeters(lat, lon, locationConfig.latitude, locationConfig.longitude);
        setDistance(dist);
        setGeoLoading(false);
      },
      (err) => {
        console.error("Gagal mengambil GPS:", err);
        setGeoError(`Gagal mendapatkan lokasi GPS: ${err.message}. Pastikan izin lokasi aktif.`);
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    getMyLocation();
  }, [locationConfig, useSimulation]);

  // 4. Do Check In Action
  const handleCheckIn = async () => {
    if (!myCoords || distance === null) {
      alert("Koordinat lokasi Anda belum terdeteksi. Silakan segarkan GPS.");
      return;
    }

    if (distance > locationConfig.radius) {
      alert(`Gagal Absen: Jarak Anda (${distance} meter) melebihi radius maksimal kantor (${locationConfig.radius} meter).`);
      return;
    }

    const todayYMD = new Date().toISOString().substring(0, 10);
    const absId = `abs-${karyawan.id}-${todayYMD}`;
    const nowISO = new Date().toISOString();
    
    // Check-in hour verification
    const currentHour = new Date().getHours();
    const currentMin = new Date().getMinutes();
    // E.g. Late if past 08:30 (adjust as necessary)
    const minutesSinceMidnight = currentHour * 60 + currentMin;
    const isLate = minutesSinceMidnight > 8 * 60 + 30; // 08:30
    
    const newLog: Absensi = {
      id: absId,
      karyawanId: karyawan.id,
      nama: karyawan.nama,
      tanggal: todayYMD,
      checkInTime: nowISO,
      latitudeIn: myCoords.latitude,
      longitudeIn: myCoords.longitude,
      distanceIn: distance,
      status: isLate ? "Terlambat" : "Hadir"
    };

    try {
      await setDoc(doc(db, "users", ownerId, "absensi", absId), newLog);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/absensi/${absId}`);
    }
  };

  // 5. Do Check Out Action
  const handleCheckOut = async () => {
    if (!absensiToday) {
      alert("Data absen masuk Anda hari ini tidak ditemukan.");
      return;
    }

    if (!myCoords || distance === null) {
      alert("Koordinat lokasi Anda belum terdeteksi. Silakan segarkan GPS.");
      return;
    }

    if (distance > locationConfig.radius) {
      alert(`Gagal Absen: Jarak Anda (${distance} meter) melebihi radius maksimal kantor (${locationConfig.radius} meter).`);
      return;
    }

    const nowISO = new Date().toISOString();
    const updatedLog: Absensi = {
      ...absensiToday,
      checkOutTime: nowISO,
      latitudeOut: myCoords.latitude,
      longitudeOut: myCoords.longitude,
      distanceOut: distance
    };

    try {
      await setDoc(doc(db, "users", ownerId, "absensi", absensiToday.id), updatedLog);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/absensi/${absensiToday.id}`);
    }
  };

  // Helper for counting leave days
  const calculateLeaveDays = (start: string, end: string) => {
    if (!start) return 0;
    const endDateToUse = end || start;
    if (endDateToUse < start) return 0;
    const d1 = new Date(start);
    const d2 = new Date(endDateToUse);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 1;
    const diffTime = d2.getTime() - d1.getTime();
    return Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
  };

  // 6. Submit leave request
  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveStartDate) {
      alert("Silakan pilih tanggal mulai izin libur.");
      return;
    }
    const finalEndDate = leaveEndDate || leaveStartDate;
    if (finalEndDate < leaveStartDate) {
      alert("Tanggal selesai libur tidak boleh lebih awal dari tanggal mulai libur.");
      return;
    }
    if (!leaveReason.trim()) {
      alert("Silakan tuliskan alasan izin.");
      return;
    }

    const totalDays = calculateLeaveDays(leaveStartDate, finalEndDate);

    setLeaveLoading(true);
    setLeaveSuccess(null);

    const izinId = `iz-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newIzin: Izin = {
      id: izinId,
      karyawanId: karyawan.id,
      nama: karyawan.nama,
      tanggal: leaveStartDate,
      tanggalSelesai: finalEndDate,
      jumlahHari: totalDays,
      alasan: leaveReason.trim(),
      status: "Pending",
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "users", ownerId, "izin", izinId), newIzin);
      setLeaveStartDate("");
      setLeaveEndDate("");
      setLeaveReason("");
      setLeaveSuccess(`Pengajuan izin (${totalDays} hari) berhasil dikirim! Menunggu persetujuan owner.`);
      setTimeout(() => setLeaveSuccess(null), 5000);
    } catch (err) {
      console.error(err);
      alert("Gagal mengirim pengajuan izin: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleDeleteMyIzin = async (iz: Izin) => {
    const tglInfo = `${iz.tanggal}${iz.tanggalSelesai && iz.tanggalSelesai !== iz.tanggal ? ` s/d ${iz.tanggalSelesai}` : ""}`;
    const confirmed = window.confirm(`Hapus pengajuan izin libur untuk periode ${tglInfo}? Gunakan fitur ini jika ada salah input tanggal.`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "users", ownerId, "izin", iz.id));
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus pengajuan izin: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Payroll / Salary calculation on client-side for Karyawan display
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

  const getCurrentStafGajiPeriod = () => {
    if (stafGajiStartDate && stafGajiEndDate) {
      const formatted = `${new Date(stafGajiStartDate).toLocaleDateString("id-ID", { day: "numeric", month: "long" })} - ${new Date(stafGajiEndDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;
      return {
        startStr: stafGajiStartDate,
        endStr: stafGajiEndDate,
        formatted
      };
    }
    return getWeeklyPeriodDates();
  };

  const weeklyPeriod = getCurrentStafGajiPeriod();
  const currentMonth = new Date().toISOString().substring(0, 7); // "YYYY-MM"
  const thisMonthAbsensi = myAbsensiList.filter((a) => a.tanggal.startsWith(currentMonth));
  
  // Weekly attendance records (Friday - Thursday)
  const currentWeekAbsensi = myAbsensiList.filter(
    (a) => a.tanggal >= weeklyPeriod.startStr && a.tanggal <= weeklyPeriod.endStr
  );
  
  // Sisa Kuota Libur (limit is 3 per month)
  const approvedLeavesThisMonth = myIzinList
    .filter(
      (iz) => iz.status === "Disetujui" && (iz.tanggal.startsWith(currentMonth) || (iz.tanggalSelesai && iz.tanggalSelesai.startsWith(currentMonth)))
    )
    .reduce((acc, iz) => acc + (iz.jumlahHari || 1), 0);
  const remainingLeaveQuota = Math.max(0, 3 - approvedLeavesThisMonth);

  const workDaysCount = currentWeekAbsensi.length; // How many times checked in this week period
  const weeklyBaseSalary = stafData.gajiPokok / 4;
  const totalFoodAllowance = workDaysCount * stafData.uangMakan;
  const bonus = stafData.bonus || 0;
  const kasbon = stafData.kasbon || 0;
  const totalPayout = weeklyBaseSalary + totalFoodAllowance + bonus;

  // Format Helper
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(val);
  };

  const getIndonesianMonthYear = () => {
    const months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const d = new Date();
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const downloadSlipGaji = () => {
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
    docPdf.text(`:  ${stafData.nama}`, 45, 56);
    docPdf.text(`:  ${stafData.id}`, 45, 62);
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
    docPdf.text(`${workDaysCount} hari hadir (@ ${formatIDR(stafData.uangMakan)})`, 110, nextY);
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

    // Row 4: Potongan Gaji Lainnya
    nextY = nextY + 10;
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(8.5);
    docPdf.setTextColor(24, 24, 27);
    docPdf.text("4. Potongan Gaji Lainnya", 18, nextY);
    docPdf.setTextColor(113, 113, 122);
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`- ${formatIDR(0)}`, 192, nextY, { align: "right" });

    nextY = nextY + 4.5;
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(7.5);
    docPdf.setTextColor(113, 113, 122);
    docPdf.text("• Keterangan: Dipotong dari uang makan / gaji", 22, nextY);

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
    docPdf.setTextColor(217, 119, 6); // amber-600
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`${formatIDR(kasbon)}`, 192, nextY, { align: "right" });

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
    if (stafData.catatanGaji && stafData.catatanGaji.trim()) {
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
      docPdf.text(stafData.catatanGaji.substring(0, 95), 18, nextY + 9.5);
    }

    // 7. System Footnotes
    nextY = nextY + 22;
    docPdf.setFont("helvetica", "italic");
    docPdf.setFontSize(8);
    docPdf.setTextColor(113, 113, 122); // zinc-500
    docPdf.text("Catatan: Komponen uang makan dihitung terintegrasi melalui perekaman absensi digital", 15, nextY);
    docPdf.text("pada saat berstatus masuk (terverifikasi berada di cakupan area GPS outlet secara sah).", 15, nextY + 4);

    // 8. Signatures Section
    nextY = nextY + 20;
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9.5);
    docPdf.setTextColor(63, 63, 70); // zinc-700
    docPdf.text("Penerima Gaji (Karyawan),", 25, nextY);
    docPdf.text("Mengetahui / Manajemen Owner,", 145, nextY);

    nextY = nextY + 18;
    docPdf.setFont("helvetica", "bold");
    docPdf.setTextColor(24, 24, 27); // zinc-900
    docPdf.text(stafData.nama, 25, nextY);
    docPdf.text("Damdam Laundry Management", 145, nextY);

    // Underline for signature names
    docPdf.setDrawColor(161, 161, 170); // zinc-400
    docPdf.setLineWidth(0.2);
    docPdf.line(25, nextY + 1.5, 65, nextY + 1.5);
    docPdf.line(145, nextY + 1.5, 195, nextY + 1.5);

    // 9. Download the PDF File
    docPdf.save(`Slip_Gaji_${stafData.nama.replace(/\s+/g, "_")}_${currentMonth}.pdf`);
  };

  const downloadHistoricSlipGaji = (exp: Expense) => {
    const docPdf = new jsPDF("p", "mm", "a4");

    docPdf.setFillColor(16, 124, 65);
    docPdf.rect(0, 0, 210, 32, "F");

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(16);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text("SLIP GAJI & BUKTI POTONGAN KARYAWAN", 15, 15);

    docPdf.setFontSize(10);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(`Riwayat Gajian Resmi - ${defaultLocation.namaLokasi || "Damdam Laundry"}`, 15, 23);

    // Metadata Box
    docPdf.setDrawColor(228, 228, 231);
    docPdf.rect(15, 38, 180, 32, "S");

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9.5);
    docPdf.setTextColor(24, 24, 27);
    docPdf.text("DATA PENERIMA GAJI:", 20, 46);
    docPdf.text("INFORMASI SLIP GAJI:", 110, 46);

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9);
    docPdf.setTextColor(71, 85, 105);
    docPdf.text(`Nama: ${stafData.nama}`, 20, 53);
    docPdf.text(`ID Staf: ${stafData.id}`, 20, 60);

    docPdf.text(`Tanggal: ${exp.date}`, 110, 53);
    docPdf.text(`Metode Bayar: ${exp.paymentMethod || "Transfer"}`, 110, 60);

    // Table
    const startY = 78;
    docPdf.setFillColor(244, 244, 245);
    docPdf.rect(15, startY, 180, 8, "F");

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9);
    docPdf.setTextColor(82, 82, 91);
    docPdf.text("KETERANGAN SLIP & RINCIAN POTONGAN", 20, startY + 5.5);
    docPdf.text("TOTAL NET (IDR)", 190, startY + 5.5, { align: "right" });

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
    docPdf.text(stafData.nama, 30, sigY + 20);
    docPdf.text("Manajemen / Owner", 130, sigY + 20);

    docPdf.save(`Slip_Gaji_${stafData.nama.replace(/\s+/g, "_")}_${exp.date}.pdf`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans">
      
      {/* 1. Header Banner */}
      <div className="bg-[#121214] border-b border-[#27272A] px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-4 shrink-0 flex items-center justify-between md:pt-4">
        <div>
          <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest bg-emerald-950/45 border border-emerald-900/50 px-2 py-0.5 rounded-none font-mono">
            PORTAL KARYAWAN
          </span>
          <h2 className="text-lg font-black tracking-tight text-white mt-1.5 uppercase">
            {karyawan.nama}
          </h2>
          <p className="text-[10px] text-zinc-500 font-bold leading-none mt-1">
            Status login aktif di {locationConfig.namaLokasi}
          </p>
        </div>
        
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-[#27272A] hover:border-red-900/60 text-zinc-400 hover:text-red-400 font-black text-[10px] uppercase tracking-wider transition-all rounded-none cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar</span>
        </button>
      </div>

      {/* 2. Scrollable Body Frame */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        
        {/* Active Shift Card Banner */}
        <div className="bg-[#121214] border border-[#27272A] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {currentShiftInfo.shift === "tidak_ada" ? (
                <Coffee className="w-4 h-4 text-zinc-400" />
              ) : currentShiftInfo.shift === "pagi" ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Sunset className="w-4 h-4 text-orange-400" />
              )}
              <span className="text-[11px] font-black text-white uppercase tracking-wider">
                Jadwal Shift Anda ({formatWeekRange(currentMonday)})
              </span>
            </div>
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 border font-mono ${
              currentShiftInfo.shift === "tidak_ada"
                ? "bg-zinc-900 text-zinc-400 border-zinc-700"
                : currentShiftInfo.shift === "siang"
                  ? "bg-amber-950/80 text-amber-400 border-amber-800"
                  : "bg-emerald-950/80 text-emerald-400 border-emerald-800"
            }`}>
              {currentShiftInfo.shiftName}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-[#0A0A0B] p-2.5 border border-zinc-900 font-mono">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-black">Jam Kerja Minggu Ini</p>
              <p className={`text-xs font-bold mt-0.5 ${currentShiftInfo.shift === "tidak_ada" ? "text-zinc-400" : "text-emerald-400"}`}>
                {currentShiftInfo.jamKerja}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-black flex items-center gap-1">
                <RotateCw className="w-2.5 h-2.5 text-zinc-400" />
                <span>Rolling Minggu Depan</span>
              </p>
              <p className="text-xs text-zinc-300 font-bold mt-0.5">
                {currentShiftInfo.shift === "tidak_ada"
                  ? "Libur / Non-Aktif"
                  : (stafData.autoRollingShift !== false ? `${nextShiftInfo.shiftName} (${nextShiftInfo.jamKerja})` : "Tetap")}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowShiftHistoryModal(true)}
            className="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-mono font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <History className="w-3.5 h-3.5 text-emerald-400" />
            <span>Lihat Riwayat Shift Saya (Mingguan & Bulanan)</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-[#121214] p-1 border border-[#27272A]">
          <button
            onClick={() => setActiveTab("absen")}
            className={`py-2 text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "absen"
                ? "bg-emerald-500 text-black font-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Absen</span>
          </button>
          <button
            onClick={() => setActiveTab("izin")}
            className={`py-2 text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "izin"
                ? "bg-emerald-500 text-black font-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Izin Libur</span>
          </button>
          <button
            onClick={() => setActiveTab("slip")}
            className={`py-2 text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "slip"
                ? "bg-emerald-500 text-black font-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Slip Gaji</span>
          </button>
        </div>

        {/* TAB EVENT: ABSENSI */}
        {activeTab === "absen" && (
          <div className="space-y-4">
            
            {/* Geolocation Card */}
            <div className="bg-[#121214] border border-[#27272A] p-4 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#27272A] pb-2.5">
                <h3 className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  <MapPin className="text-emerald-500 w-4 h-4 shrink-0" /> Geolocation Radius Check
                </h3>
                <button
                  onClick={getMyLocation}
                  disabled={geoLoading}
                  className="flex items-center gap-1 px-2 py-0.5 bg-zinc-950 border border-[#27272A] hover:border-emerald-500 text-zinc-400 font-bold font-mono text-[9px] uppercase cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${geoLoading ? "animate-spin" : ""}`} />
                  <span>Refresh GPS</span>
                </button>
              </div>

              {/* Mode Selector Toggle */}
              <div className="flex flex-col gap-2 bg-amber-100 border border-amber-300 p-3.5 mt-2.5 select-none text-left rounded-md shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-amber-950 tracking-wider font-sans leading-none">MODE SIMULASI ABSENSI</span>
                    <span className="text-[11px] font-bold text-amber-900 font-sans mt-1.5">Gunakan koordinat tepat di outlet (Demo)</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={useSimulation}
                      onChange={(e) => setUseSimulation(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-zinc-400 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-100 after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-white peer-checked:after:border-transparent"></div>
                  </label>
                </div>
                <div className="text-[9.5px] leading-tight text-amber-950 border-t border-amber-200/60 pt-2 mt-1">
                  💡 <span className="font-semibold">Petunjuk Warna:</span> Saklar <span className="font-black text-emerald-700">AKTIF (Hijau 🟢)</span> berarti koordinat disimulasikan tepat di outlet agar Anda siap melakukan absen masuk secara instan.
                </div>
              </div>

              {geoLoading ? (
                <div className="py-6 flex flex-col items-center justify-center space-y-2">
                  <span className="w-5 h-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                  <p className="text-[9.5px] font-mono text-zinc-455 font-bold uppercase tracking-wider">Mencari Koordinat GPS Presisi...</p>
                </div>
              ) : geoError ? (
                <div className="space-y-3 mt-3">
                  <div className="p-3 bg-[#1F1111] border border-red-900/30 text-red-400 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="text-[9.5px] font-semibold leading-normal">
                      <p className="font-extrabold uppercase text-red-500">Izin Geolocation Dimatikan / Gagal</p>
                      <p className="mt-0.5 text-zinc-400 leading-tight">{geoError}</p>
                    </div>
                  </div>
                  <div className="p-2.5 bg-zinc-950 border border-zinc-900 text-[10px] text-zinc-400 text-left leading-relaxed">
                    💡 <span className="font-bold text-zinc-300">Tips Uji Coba:</span> Aktifkan saklar <span className="font-bold text-emerald-400">MODE SIMULASI ABSENSI</span> di atas untuk melakukan absensi demo secara instan tanpa block.
                  </div>
                </div>
              ) : myCoords && distance !== null ? (
                <div className="mt-3.5 space-y-3 font-sans">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#0A0A0B] p-2 border border-zinc-900">
                      <span className="text-[8.5px] font-bold text-zinc-550 block uppercase leading-none mb-1">Koordinat Anda</span>
                      <span className="text-[10px] font-semibold font-mono text-white tracking-tighter">
                        {myCoords.latitude.toFixed(6)}, {myCoords.longitude.toFixed(6)}
                      </span>
                    </div>
                    <div className="bg-[#0A0A0B] p-2 border border-zinc-900">
                      <span className="text-[8.5px] font-bold text-zinc-550 block uppercase leading-none mb-1">Pintu Outlet Center</span>
                      <span className="text-[10px] font-semibold font-mono text-white tracking-tighter">
                        {locationConfig.latitude.toFixed(6)}, {locationConfig.longitude.toFixed(6)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-zinc-950/70 border border-zinc-900 flex items-center justify-between">
                    <div>
                      <span className="text-[8.5px] font-mono font-bold text-zinc-450 uppercase block leading-none">Jarak Anda ke Outlet</span>
                      <span className={`text-xl font-black font-mono tracking-tighter ${
                        distance <= locationConfig.radius ? "text-emerald-400" : "text-amber-500"
                      }`}>
                        {distance} meter
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8.5px] font-mono font-bold text-zinc-450 uppercase block leading-none">Radius Maksimal</span>
                      <span className="text-sm font-black font-mono text-white">
                        {locationConfig.radius} meter
                      </span>
                    </div>
                  </div>

                  {distance <= locationConfig.radius ? (
                    <div className="p-2 bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 text-[10px] font-semibold flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Anda berada dalam jangkauan outlet! Siap absen.</span>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-[#1F1111] border border-red-900/30 text-red-400 text-[10px] font-semibold flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <span>Absensi terkunci karena Anda berada di luar batas outlet ({distance - locationConfig.radius}m terlalu jauh).</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-5 text-center text-[10px] uppercase font-bold text-zinc-500">
                  Data GPS belum dimuat. Segarkan halaman.
                </div>
              )}
            </div>

            {/* Check-In Controls */}
            <div className="bg-[#121214] border border-[#27272A] p-4 space-y-4">
              <h3 className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2">
                Log Absensi Hari Ini ({new Date().toLocaleDateString("id-ID", { dateStyle: "medium" })})
              </h3>

              {!absensiToday ? (
                <div className="space-y-3 grid grid-cols-1">
                  <div className="text-center p-3 bg-zinc-950 border border-zinc-900 text-zinc-450 font-bold text-[10.5px] uppercase">
                    ❌ Anda belum absen masuk hari ini.
                  </div>
                  <button
                    onClick={handleCheckIn}
                    disabled={!myCoords || distance === null || distance > locationConfig.radius || geoLoading}
                    className="w-full py-3 bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-650 text-black font-black uppercase text-xs tracking-widest hover:bg-emerald-400 transition-all cursor-pointer rounded-none"
                  >
                    ABSEN MASUK (CHECK-IN)
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-[#0A0A0B] p-3 border border-emerald-900/30 text-left space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-emerald-400">Absen Masuk Tercatat</span>
                      <span className={`text-[8.5px] font-bold uppercase tracking-widest font-mono border px-1.5 py-0.5 ${
                        absensiToday.status === "Hadir"
                          ? "bg-emerald-950/50 border-emerald-800/40 text-emerald-400"
                          : "bg-amber-950/50 border-amber-850/40 text-amber-500"
                      }`}>
                        {absensiToday.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
                      <span>Jam Masuk</span>
                      <span className="font-mono text-white text-xs">
                        {new Date(absensiToday.checkInTime).toLocaleTimeString("id-ID", { timeStyle: "medium" })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-350">
                      <span>Jarak Cek</span>
                      <span className="font-mono text-zinc-200">
                        {absensiToday.distanceIn ? `${absensiToday.distanceIn}m` : "-"}
                      </span>
                    </div>
                  </div>

                  {!absensiToday.checkOutTime ? (
                    <button
                      onClick={handleCheckOut}
                      disabled={!myCoords || distance === null || distance > locationConfig.radius || geoLoading}
                      className="w-full py-3 bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-650 text-black font-black uppercase text-xs tracking-widest hover:bg-amber-400 transition-all cursor-pointer rounded-none"
                    >
                      ABSEN PULANG (CHECK-OUT)
                    </button>
                  ) : (
                    <div className="bg-[#0A0A0B] p-3 border border-zinc-900 text-left space-y-2">
                      <span className="text-xs font-black uppercase text-zinc-400 block">Absen Pulang Tercatat</span>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
                        <span>Jam Pulang</span>
                        <span className="font-mono text-white text-xs">
                          {new Date(absensiToday.checkOutTime).toLocaleTimeString("id-ID", { timeStyle: "medium" })}
                        </span>
                      </div>
                      <div className="p-2 bg-emerald-950/20 border border-emerald-950/30 text-emerald-400 font-bold text-[9.5px] uppercase tracking-wider text-center">
                        🎯 Absensi Hari Ini Selesai
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Riwayat Absensi & Filter Tanggal */}
            <div className="bg-[#121214] border border-[#27272A] p-4">
              <h3 className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3">
                Riwayat & Filter Kehadiran
              </h3>

              {/* Date Filter Inputs */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[8px] font-black uppercase text-zinc-500 block mb-1">Mulai Tanggal</label>
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={(e) => setHistoryStartDate(e.target.value)}
                    className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-2.5 py-1.5 outline-none focus:border-emerald-500 text-[11px] font-bold font-mono rounded-none"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-zinc-500 block mb-1">Sampai Tanggal</label>
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={(e) => setHistoryEndDate(e.target.value)}
                    className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-2.5 py-1.5 outline-none focus:border-emerald-500 text-[11px] font-bold font-mono rounded-none"
                  />
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 gap-2 text-center pb-2.5 border-b border-zinc-900 mb-3">
                <div className="bg-[#0A0A0B] p-2.5 border border-zinc-900">
                  <span className="text-[8.5px] text-zinc-500 font-bold block uppercase leading-none mb-1">Hadir Tepat</span>
                  <span className="text-xl font-bold text-emerald-400 font-mono">
                    {filteredHistoryAbsensi.filter((r) => r.status === "Hadir").length} Hari
                  </span>
                </div>
                <div className="bg-[#0A0A0B] p-2.5 border border-zinc-900">
                  <span className="text-[8.5px] text-zinc-500 font-bold block uppercase leading-none mb-1">Terlambat</span>
                  <span className="text-xl font-bold text-amber-500 font-mono">
                    {filteredHistoryAbsensi.filter((r) => r.status === "Terlambat").length} Hari
                  </span>
                </div>
              </div>

              {/* Scrolling List */}
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {filteredHistoryAbsensi.length === 0 ? (
                  <p className="text-[10px] text-zinc-500 text-center italic py-2">Belum ada absen di periode ini.</p>
                ) : (
                  filteredHistoryAbsensi.map((log) => (
                    <div key={log.id} className="bg-[#0A0A0B] border border-zinc-950 p-2 text-[10.5px] flex items-center justify-between font-mono">
                      <div>
                        <span className="font-sans font-bold text-white block">{log.tanggal}</span>
                        <span className="text-[9px] text-zinc-500 font-mono">In: {new Date(log.checkInTime).toLocaleTimeString("id-ID", { timeStyle: "short" })}</span>
                        {log.checkOutTime && (
                          <span className="text-[9px] text-zinc-500 font-mono ml-2">Out: {new Date(log.checkOutTime).toLocaleTimeString("id-ID", { timeStyle: "short" })}</span>
                        )}
                      </div>
                      <span className={`text-[8px] px-1.5 py-0.5 border uppercase tracking-wider font-extrabold ${
                        log.status === "Hadir"
                          ? "border-emerald-950/60 bg-emerald-950/20 text-emerald-400"
                          : "border-amber-950/60 bg-amber-950/20 text-amber-500"
                      }`}>
                        {log.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB EVENT: IZIN LIBUR */}
        {activeTab === "izin" && (
          <div className="space-y-4 font-sans">
            
            {/* Leave Quota Tracker Box */}
            <div className="bg-[#121214] border border-[#27272A] p-4">
              <span className="text-[9px] font-black uppercase text-[#A1A1AA] tracking-wider block mb-2.5">INFORMASI KUOTA CUTI BULANAN</span>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="bg-[#0A0A0B] p-2 border border-zinc-900 flex flex-col justify-between">
                  <span className="text-zinc-500 font-bold uppercase text-[8px] leading-none mb-1">Batas Quota</span>
                  <span className="font-mono text-white font-extrabold text-base">3 Hari</span>
                </div>
                <div className="bg-[#0A0A0B] p-2 border border-zinc-900 flex flex-col justify-between">
                  <span className="text-zinc-500 font-bold uppercase text-[8px] leading-none mb-1">Diambil</span>
                  <span className="font-mono text-emerald-400 font-extrabold text-base">{approvedLeavesThisMonth} Hari</span>
                </div>
                <div className="bg-[#0A0A0B] p-2 border border-zinc-900 flex flex-col justify-between">
                  <span className="text-zinc-500 font-bold uppercase text-[8px] leading-none mb-1">Sisa Kuota</span>
                  <span className={`font-mono font-extrabold text-base ${remainingLeaveQuota > 0 ? "text-amber-500" : "text-red-500"}`}>
                    {remainingLeaveQuota} Hari
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-zinc-500 leading-normal mt-2.5 uppercase font-medium">
                ⚠️ SETIAP HARI LIBUR / IZIN, UANG MAKAN HARIAN AKAN DIPOTONG (TIDAK DIBAYARKAN). JATAH KUOTA AWAL ADALAH 3 HARI SEBULAN.
              </p>
            </div>

            {/* Form Pengejuan Izin */}
            <form onSubmit={handleSubmitLeave} className="bg-[#121214] border border-[#27272A] p-4 space-y-4">
              <h3 className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2">
                Formulir Pengajuan Izin Libur
              </h3>

              {leaveSuccess && (
                <div className="p-3 bg-emerald-950/25 border border-emerald-900/30 text-[#10B981] text-[10.5px] font-semibold uppercase font-sans animate-fade-in text-center">
                  {leaveSuccess}
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                      Awal Libur (Tanggal Mulai) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={leaveStartDate}
                      onChange={(e) => {
                        const newStart = e.target.value;
                        setLeaveStartDate(newStart);
                        if (!leaveEndDate || leaveEndDate < newStart) {
                          setLeaveEndDate(newStart);
                        }
                      }}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2.5 outline-none focus:border-emerald-500 font-mono text-xs rounded-none"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-zinc-400 block mb-1">
                      Sampai Libur (Tanggal Selesai)
                    </label>
                    <input
                      type="date"
                      value={leaveEndDate}
                      min={leaveStartDate || undefined}
                      onChange={(e) => setLeaveEndDate(e.target.value)}
                      placeholder="Sama dengan tanggal mulai jika 1 hari"
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2.5 outline-none focus:border-emerald-500 font-mono text-xs rounded-none"
                    />
                  </div>
                </div>

                {leaveStartDate && (
                  <div className="bg-[#18181b] border border-[#27272A] p-2.5 flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-400 text-[10px] uppercase font-sans font-bold">Total Durasi Libur:</span>
                    <span className="text-emerald-400 font-extrabold flex items-center gap-1.5">
                      <span>{calculateLeaveDays(leaveStartDate, leaveEndDate || leaveStartDate)} Hari Libur</span>
                      <span className="text-[10px] text-zinc-400 font-normal">
                        ({leaveStartDate}{leaveEndDate && leaveEndDate !== leaveStartDate ? ` s/d ${leaveEndDate}` : ""})
                      </span>
                    </span>
                  </div>
                )}

                <div>
                  <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Alasan Pengajuan</label>
                  <textarea
                    required
                    rows={3}
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="Contoh: Menghadiri nikahan keluarga di luar kota, sakit flu demam, atau keperluan keluarga esensial..."
                    className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2.5 outline-none focus:border-emerald-500 placeholder-zinc-650 text-xs rounded-none resize-none leading-relaxed"
                  />
                </div>

                <button
                  type="submit"
                  disabled={leaveLoading}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest transition-all cursor-pointer rounded-none disabled:opacity-50"
                >
                  {leaveLoading ? "MENGIRIMKAN..." : `KIRIM PENGAJUAN IZIN ${leaveStartDate ? `(${calculateLeaveDays(leaveStartDate, leaveEndDate || leaveStartDate)} HARI)` : ""}`}
                </button>
              </div>
            </form>

            {/* Riwayat Pengajuan Izin */}
            <div className="bg-[#121214] border border-[#27272A] p-4">
              <h3 className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3.5">
                Riwayat Pengajuan Izin Anda
              </h3>

              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {myIzinList.length === 0 ? (
                  <p className="text-[10px] text-zinc-500 text-center italic py-4">Belum ada riwayat pengajuan izin libur.</p>
                ) : (
                  myIzinList.map((iz) => (
                    <div key={iz.id} className="bg-[#0A0A0B] border border-zinc-950 p-3 text-[11px] relative leading-relaxed">
                      <div className="flex items-center justify-between border-b border-zinc-900/60 pb-1.5 gap-2">
                        <div className="font-bold text-white font-mono flex flex-wrap items-center gap-1.5 text-xs">
                          <span>📅 {iz.tanggal}</span>
                          {iz.tanggalSelesai && iz.tanggalSelesai !== iz.tanggal && (
                            <span className="text-amber-400 font-mono">s/d {iz.tanggalSelesai}</span>
                          )}
                          <span className="text-[10px] text-zinc-400 font-sans font-normal bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                            {iz.jumlahHari || 1} Hari
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[8.5px] font-sans font-black uppercase tracking-wider px-2 py-0.5 border ${
                            iz.status === "Pending"
                              ? "bg-amber-950/20 border-amber-850/30 text-amber-500"
                              : iz.status === "Disetujui"
                              ? "bg-emerald-950/20 border-emerald-900/30 text-emerald-450"
                              : "bg-red-950/20 border-red-940/30 text-red-400"
                          }`}>
                            {iz.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteMyIzin(iz)}
                            className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-900/40 transition-colors cursor-pointer"
                            title="Hapus / Batalkan pengajuan izin (jika salah input tanggal)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-400 italic mt-2">
                        “{iz.alasan}”
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB EVENT: SLIP GAJI */}
        {activeTab === "slip" && (
          <div className="space-y-3 font-sans">
            <div className="bg-[#121214] border border-[#27272A] p-4 relative overflow-hidden text-left shadow-md leading-relaxed">
              <div className="absolute top-0 right-0 w-24 h-24 bg-zinc-900/40 rounded-full blur-2xl" />
              
              <div className="border-b border-[#27272A] pb-3 mb-4 text-center">
                <h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-widest font-mono">
                  RISALAH GAJI & INSENTIF MINGGUAN (KAMIS)
                </h4>
                <p className="text-[10px] uppercase font-bold text-[#f59e0b] tracking-wider font-mono">
                  PERIODE: {weeklyPeriod.formatted.toUpperCase()}
                </p>
              </div>

              {/* Filter Periode Gaji Karyawan */}
              <div className="bg-[#0A0A0B] border border-zinc-900 p-3 space-y-3 mb-4 text-left">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] font-black uppercase text-zinc-500 block mb-1">Mulai Tanggal</label>
                    <input
                      type="date"
                      value={stafGajiStartDate}
                      onChange={(e) => setStafGajiStartDate(e.target.value)}
                      className="w-full bg-[#121214] border border-[#27272A] text-white px-2 py-1 outline-none focus:border-emerald-500 text-[10px] font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase text-zinc-500 block mb-1">Sampai Tanggal</label>
                    <input
                      type="date"
                      value={stafGajiEndDate}
                      onChange={(e) => setStafGajiEndDate(e.target.value)}
                      className="w-full bg-[#121214] border border-[#27272A] text-white px-2 py-1 outline-none focus:border-emerald-500 text-[10px] font-bold font-mono"
                    />
                  </div>
                </div>
                
                {/* Pintasan Periode Cepat */}
                <div className="flex flex-wrap gap-1 pt-1.5 border-t border-zinc-900/60">
                  <span className="text-[8px] font-black text-[#A1A1AA] uppercase tracking-wider self-center mr-1">Filter Cepat:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const todayStr = new Date().toISOString().substring(0, 10);
                      setStafGajiStartDate(todayStr);
                      setStafGajiEndDate(todayStr);
                    }}
                    className="text-[8.5px] bg-zinc-900 hover:bg-zinc-850 text-zinc-350 hover:text-white px-2 py-0.5 border border-zinc-850 font-semibold cursor-pointer transition-all uppercase"
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setDate(end.getDate() - 7);
                      setStafGajiStartDate(start.toISOString().substring(0, 10));
                      setStafGajiEndDate(end.toISOString().substring(0, 10));
                    }}
                    className="text-[8.5px] bg-zinc-900 hover:bg-zinc-850 text-zinc-350 hover:text-white px-2 py-0.5 border border-zinc-850 font-semibold cursor-pointer transition-all uppercase"
                  >
                    7 Hari
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const start = new Date(now.getFullYear(), now.getMonth(), 1);
                      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                      setStafGajiStartDate(start.toISOString().substring(0, 10));
                      setStafGajiEndDate(end.toISOString().substring(0, 10));
                    }}
                    className="text-[8.5px] bg-zinc-900 hover:bg-zinc-850 text-zinc-350 hover:text-white px-2 py-0.5 border border-zinc-850 font-semibold cursor-pointer transition-all uppercase"
                  >
                    Bulan Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStafGajiStartDate("");
                      setStafGajiEndDate("");
                    }}
                    className="text-[8.5px] bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white px-2 py-0.5 border border-zinc-850 font-semibold cursor-pointer transition-all uppercase"
                  >
                    Mulai Ulang
                  </button>
                </div>
              </div>

              {/* Salary details list */}
              <div className="space-y-3">
                <div className="bg-[#0A0A0B] border border-zinc-950 p-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-[8.5px] font-extrabold uppercase text-zinc-550 block">Gaji Pokok Mingguan (1/4 Bulanan)</span>
                    <span className="text-zinc-400 text-xs">Gaji bulanan terdaftar: {formatIDR(stafData.gajiPokok)}</span>
                  </div>
                  <span className="text-sm font-black font-mono text-white text-right">
                    {formatIDR(weeklyBaseSalary)}
                  </span>
                </div>

                <div className="bg-[#0A0A0B] border border-zinc-950 p-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-[8.5px] font-extrabold uppercase text-zinc-550 block">Uang Makan Per Hari (Hadir)</span>
                    <span className="text-zinc-400 text-xs">
                      {stafData.uangMakan ? `${formatIDR(stafData.uangMakan)} / hari × ${workDaysCount} hari` : "Belum diatur"}
                    </span>
                  </div>
                  <span className="text-sm font-black font-mono text-white text-right">
                    {formatIDR(totalFoodAllowance)}
                  </span>
                </div>

                <div className="bg-[#0A0A0B] border border-zinc-950 p-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-[8.5px] font-extrabold uppercase text-emerald-500 block">Bonus Tambahan</span>
                    <span className="text-zinc-400 text-xs">Pemberian oleh Owner</span>
                  </div>
                  <span className="text-sm font-black font-mono text-emerald-400 text-right">
                    + {formatIDR(bonus)}
                  </span>
                </div>

                <div className="bg-[#0A0A0B] border border-zinc-950 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[8.5px] font-extrabold uppercase text-amber-500 block">Kasbon Tercatat</span>
                      <span className="text-zinc-500 text-xs">Saldo pinjaman aktif</span>
                    </div>
                    <span className="text-sm font-black font-mono text-amber-500 text-right">
                      {formatIDR(kasbon)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowKasbonModal(true)}
                    className="w-full py-1.5 px-2 bg-zinc-900 hover:bg-amber-950/60 text-zinc-300 hover:text-amber-400 border border-zinc-800 hover:border-amber-700/60 text-[10.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <History className="w-3 h-3 text-amber-400" />
                    <span>Lihat & Unduh Riwayat Kasbon ({myKasbonHistory.length})</span>
                  </button>
                </div>

                {/* Bright, stateful, and highly legible leave analysis card for Karyawan */}
                <div className={`p-3 border rounded-md my-2.5 text-xs flex flex-col gap-1.5 ${
                  approvedLeavesThisMonth === 0 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-950" 
                    : approvedLeavesThisMonth < 3
                    ? "bg-amber-50 border-amber-200 text-amber-950"
                    : "bg-rose-50 border-rose-200 text-rose-950"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-sans font-extrabold uppercase text-[9px] tracking-wider text-zinc-600">ANALISIS JATAH LIBUR (BULAN INI):</span>
                    <span className="font-mono text-xs font-black">
                      Diambil: <span className="underline">{approvedLeavesThisMonth} Hari</span>
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between border-t border-dotted border-zinc-300 pt-1.5 mt-0.5">
                    <span className="text-[11px] font-medium flex items-center gap-1">
                      STATUS: 
                      {approvedLeavesThisMonth === 0 && <span className="font-black text-emerald-700">🟢 UTUH (Jatah Aman)</span>}
                      {approvedLeavesThisMonth > 0 && approvedLeavesThisMonth < 3 && <span className="font-black text-amber-700">🟡 TERPAKAI SEBAGIAN</span>}
                      {approvedLeavesThisMonth >= 3 && <span className="font-black text-rose-700">🔴 MAKSIMAL (Kuota Habis)</span>}
                    </span>
                    <span className="font-mono font-extrabold text-xs">
                      Sisa Quota: {remainingLeaveQuota} / 3 Hari
                    </span>
                  </div>
                  
                  <div className="text-[9.5px] leading-tight text-zinc-600 mt-1 text-left">
                    💡 <span className="font-semibold">Panduan Warna Status:</span> <span className="text-emerald-750 font-bold">Hijau (Lengkap 3 hari)</span>, <span className="text-amber-750 font-bold">Kuning (Terpakai &lt; 3 hari)</span>, <span className="text-rose-750 font-bold">Merah (Kuota habis/Lebih)</span>.
                  </div>
                </div>

                {stafData.catatanGaji && stafData.catatanGaji.trim() && (
                  <div className="bg-[#1A1A1E] border border-zinc-800 p-2.5 text-left">
                    <span className="text-[8px] font-extrabold uppercase text-zinc-550 block mb-1">Catatan Tambahan Owner:</span>
                    <p className="text-[10.5px] text-zinc-300 italic">“{stafData.catatanGaji}”</p>
                  </div>
                )}

                <div className="pt-2 border-t border-dashed border-[#27272A] flex items-center justify-between">
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    Estimasi Payout Gaji
                  </span>
                  <div className="text-right">
                    <span className="text-lg font-black text-emerald-400 font-mono">
                      {formatIDR(totalPayout)}
                    </span>
                    <p className="text-[8px] font-bold text-zinc-550 uppercase leading-none mt-0.5">
                      Selesai hitung otomatis
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-zinc-950/60 border border-zinc-900 text-zinc-400 text-[10px] font-semibold tracking-wide italic leading-relaxed mt-4">
                💡 Seluruh perhitungan gaji ditata real-time sesuai absensi kehadiran sah, bonus apresiasi, potongan pinjaman kasbon, kuota sisa libur, & catatan dari manajemen owner.
              </div>

              {/* Download Slip Gaji Button */}
              <button
                onClick={downloadSlipGaji}
                className="w-full mt-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-widest transition-all cursor-pointer rounded-none flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>DOWNLOAD SLIP GAJI (.PDF)</span>
              </button>
            </div>

            {/* Riwayat Absensi & Slip Rekap */}
            <div className="bg-[#121214] border border-[#27272A] p-4">
              <h3 className="text-[10.5px] font-black text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A] pb-2 mb-3">
                Rekap Bulanan Riwayat Kerja
              </h3>

              <div className="grid grid-cols-3 gap-1 grid-flow-row text-center mb-3 text-[10px]">
                <div className="bg-[#0A0A0B] p-2 border border-zinc-900">
                  <span className="text-zinc-500 font-bold block text-[8px] uppercase leading-none mb-1">Hadir Masuk</span>
                  <span className="font-bold text-white font-mono">{workDaysCount} ×</span>
                </div>
                <div className="bg-[#0A0A0B] p-2 border border-zinc-900">
                  <span className="text-zinc-500 font-bold block text-[8px] uppercase leading-none mb-1">Mangkir / Izin</span>
                  <span className="font-bold text-white font-mono">
                    {myIzinList.filter((iz) => iz.status === "Disetujui" && iz.tanggal.startsWith(currentMonth)).length} ×
                  </span>
                </div>
                <div className="bg-[#0A0A0B] p-2 border border-zinc-900">
                  <span className="text-zinc-500 font-bold block text-[8px] uppercase leading-none mb-1">Izin Pending</span>
                  <span className="font-bold text-white font-mono">
                    {myIzinList.filter((iz) => iz.status === "Pending" && iz.tanggal.startsWith(currentMonth)).length} ×
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {thisMonthAbsensi.length === 0 ? (
                  <p className="text-[10px] text-zinc-500 text-center italic py-2">Belum ada database kehadiran tersimpan bulan ini.</p>
                ) : (
                  thisMonthAbsensi.map((log) => (
                    <div key={log.id} className="bg-[#0A0A0B] border border-zinc-950 p-2 text-[10px] flex items-center justify-between font-mono">
                      <span className="text-zinc-400 font-bold font-sans">{log.tanggal}</span>
                      <span className="text-[9px] text-emerald-400 font-extrabold uppercase">Masuk Kerja</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Riwayat Penerimaan Gajian & Potongan (Employee View) */}
            {(() => {
              const myPayrollList = stafPayrollHistory.filter((exp) => {
                if (exp.karyawanId === stafData.id) return true;
                const nameLow = (stafData.nama || "").toLowerCase();
                const titleLow = (exp.title || "").toLowerCase();
                const notesLow = (exp.notes || "").toLowerCase();
                return titleLow.includes(nameLow) || notesLow.includes(nameLow);
              }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

              return (
                <div className="bg-[#121214] border border-[#27272A] p-4 text-left">
                  <div className="flex items-center justify-between border-b border-[#27272A] pb-2 mb-3">
                    <h3 className="text-[10.5px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <FileText className="w-3.5 h-3.5 text-emerald-500" /> RIWAYAT PENERIMAAN GAJI & POTONGAN
                    </h3>
                    <span className="text-[9.5px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 border border-zinc-800 font-bold">
                      {myPayrollList.length} Slip Tersimpan
                    </span>
                  </div>

                  {myPayrollList.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500 italic text-[11px] bg-[#0A0A0B] border border-zinc-900">
                      Belum ada riwayat pembayaran gaji yang tercatat. Seluruh riwayat gajian mingguan dan potongan (seperti terlambat atau pulang awal) akan otomatis muncul di sini.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {myPayrollList.map((exp) => {
                        const hasDeduction = exp.notes?.includes("Potong Gaji") || exp.notes?.includes("Potongan") || exp.notes?.includes("Terlambat") || exp.notes?.includes("Pulang");
                        return (
                          <div key={exp.id} className="bg-[#0A0A0B] border border-zinc-900 p-2.5 text-[11px] font-sans space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-white font-bold text-[11.5px]">{exp.title}</span>
                              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 border border-zinc-850">{exp.date}</span>
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-zinc-400">Metode: <strong className="text-zinc-300">{exp.paymentMethod || "Transfer"}</strong></span>
                              <span className="text-emerald-400 font-black font-mono text-xs">{formatIDR(exp.amount)}</span>
                            </div>

                            {exp.notes && (
                              <div className={`p-2 rounded text-[10.5px] leading-relaxed ${
                                hasDeduction ? "bg-amber-950/40 border border-amber-900/60 text-amber-200" : "bg-zinc-950 border border-zinc-850 text-zinc-400"
                              }`}>
                                {exp.notes}
                              </div>
                            )}

                            <div className="pt-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => downloadHistoricSlipGaji(exp)}
                                className="text-[10px] bg-zinc-850 hover:bg-emerald-600 text-zinc-300 hover:text-black font-bold uppercase px-2 py-1 flex items-center gap-1 transition cursor-pointer"
                              >
                                <Download className="w-3 h-3" /> Download Slip PDF
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* MODAL RIWAYAT KASBON KARYAWAN */}
      {showKasbonModal && (() => {
        const currentKasbonVal剩下 = stafData.kasbon || 0;
        const enrichedList = enrichKasbonHistory(myKasbonHistory, currentKasbonVal剩下);

        const totalPinjaman = myKasbonHistory
          .filter(h => h.tipe === "penambahan")
          .reduce((sum, h) => sum + (h.jumlah || 0), 0);

        const totalPotongan = myKasbonHistory
          .filter(h => h.tipe === "pengurangan")
          .reduce((sum, h) => sum + (h.jumlah || 0), 0);

        const saldoAwalKasbon = Math.max(0, currentKasbonVal剩下 - totalPinjaman + totalPotongan);

        return (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-[#121214] border border-zinc-800 w-full max-w-lg p-5 space-y-4 shadow-2xl rounded-lg text-left">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5 font-sans">
                    <History className="w-3.5 h-3.5 text-amber-400" /> RIWAYAT KASBON & POTONGAN SAYA
                  </h4>
                  <p className="text-white text-lg font-extrabold mt-0.5">{stafData.nama}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowKasbonModal(false)}
                  className="text-zinc-400 hover:text-white font-bold transition p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Ringkasan Saldo Kasbon 4 Cards */}
              <div className="grid grid-cols-4 gap-1.5 bg-[#0A0A0B] border border-zinc-850 p-2.5 rounded text-xs font-sans">
                <div className="p-1 bg-zinc-900/60 border border-zinc-800 rounded">
                  <p className="text-[8.5px] uppercase font-bold text-zinc-400">Saldo Awal</p>
                  <p className="text-xs font-black text-zinc-200 font-mono mt-0.5">{formatIDR(saldoAwalKasbon)}</p>
                </div>
                <div className="p-1 bg-blue-950/40 border border-blue-900/50 rounded">
                  <p className="text-[8.5px] uppercase font-bold text-blue-400">Pinjaman (+)</p>
                  <p className="text-xs font-black text-blue-400 font-mono mt-0.5">{formatIDR(totalPinjaman)}</p>
                </div>
                <div className="p-1 bg-rose-950/40 border border-rose-900/50 rounded">
                  <p className="text-[8.5px] uppercase font-bold text-rose-400">Pelunasan (-)</p>
                  <p className="text-xs font-black text-rose-400 font-mono mt-0.5">{formatIDR(totalPotongan)}</p>
                </div>
                <div className="p-1 bg-amber-950/40 border border-amber-900/50 rounded text-right">
                  <p className="text-[8.5px] uppercase font-bold text-amber-400">Saldo Aktif</p>
                  <p className="text-xs font-black text-amber-400 font-mono mt-0.5">{formatIDR(currentKasbonVal剩下)}</p>
                </div>
              </div>

              {/* Daftar Mutasi Kasbon */}
              <div className="max-h-[300px] overflow-y-auto border border-zinc-850 rounded divide-y divide-zinc-850 bg-black/40">
                {enrichedList.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 italic text-xs font-sans space-y-1.5">
                    <p className="text-sm">📭 Belum ada riwayat kasbon.</p>
                    <p className="text-[10.5px] text-zinc-500 font-normal">
                      Setiap pengambilan kasbon dan pemotongan saat gajian akan tercatat rinci di sini.
                    </p>
                  </div>
                ) : (
                  enrichedList.map((hist) => {
                    const isAdd = hist.tipe === "penambahan";
                    return (
                      <div key={hist.id} className="p-3 flex items-start gap-2.5 hover:bg-zinc-900/40 transition">
                        <div className={`p-1.5 rounded mt-0.5 flex-shrink-0 ${
                          isAdd ? "bg-blue-950 text-blue-400 border border-blue-900/60" : "bg-rose-950 text-rose-400 border border-rose-900/60"
                        }`}>
                          {isAdd ? <Plus className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        </div>

                        <div className="flex-grow space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-black uppercase ${
                              isAdd ? "text-blue-400" : "text-rose-400"
                            }`}>
                              {isAdd ? "Penambahan Kasbon (+)" : "Potong / Pelunasan (-)"}
                            </span>
                            <span className="text-[10.5px] font-mono text-zinc-400 font-semibold">{hist.tanggal}</span>
                          </div>

                          <p className="text-zinc-200 text-[12px] font-medium leading-relaxed">
                            {hist.keterangan || "-"}
                          </p>

                          <div className="flex items-center justify-between pt-1 border-t border-zinc-850 mt-1">
                            <span className="text-[10px] text-zinc-500 font-mono">
                              Saldo Kasbon: <strong className="text-zinc-300">{formatIDR(hist.saldoSetelahnya)}</strong>
                            </span>
                            <span className={`text-xs font-black font-mono ${
                              isAdd ? "text-blue-400" : "text-rose-400"
                            }`}>
                              {isAdd ? "+" : "-"} {formatIDR(hist.jumlah)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Actions: Download PDF, Excel / CSV, and Close */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800 font-sans">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      exportKasbonSinglePDF({
                        karyawan: stafData,
                        historyList: enrichedList,
                        currentKasbon: currentKasbonVal剩下,
                        outletName: locationConfig.namaLokasi || "Clean & Fresh Laundry"
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px] rounded tracking-wider uppercase transition cursor-pointer"
                    title="Unduh laporan resmi riwayat kasbon format PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      exportKasbonSingleCSV({
                        karyawan: stafData,
                        historyList: enrichedList,
                        currentKasbon: currentKasbonVal剩下,
                        outletName: locationConfig.namaLokasi || "Clean & Fresh Laundry"
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] rounded tracking-wider uppercase transition cursor-pointer"
                    title="Unduh data riwayat kasbon format Excel/CSV"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowKasbonModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black text-[11px] rounded tracking-wider uppercase transition cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Riwayat Shift Karyawan */}
      {showShiftHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-[#0A0A0B] border border-[#27272A] w-full max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-5 relative shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#27272A]">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                  Riwayat Shift: {stafData.nama}
                </h3>
              </div>
              <button
                onClick={() => setShowShiftHistoryModal(false)}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white font-mono text-xs cursor-pointer font-bold uppercase"
              >
                ✕ Tutup
              </button>
            </div>

            <ShiftHistoryView
              ownerId={ownerId}
              karyawanList={[stafData]}
              absensiList={myAbsensiList}
              shiftSettings={shiftSettings}
              isKaryawanMode={true}
              currentKaryawanId={stafData.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}
