import React, { useState, useEffect, useMemo } from "react";
import { 
  Karyawan, 
  ShiftSettings, 
  ShiftType, 
  Absensi, 
  Izin, 
  ShiftOverride 
} from "../types";
import { 
  DEFAULT_SHIFT_SETTINGS,
  calculateEmployeeShift,
  calculateEmployeeShiftWithOverride,
  getPastWeeks,
  getPastMonths,
  getMondayOfDate,
  getSundayOfDate,
  formatIndonesianDate,
  formatWeekRange,
  dateToYMD,
  WeekInfo,
  MonthInfo,
  DayInfo
} from "../utils/shiftUtils";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Calendar, 
  Clock, 
  Sun, 
  Sunset, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  CalendarDays, 
  ArrowRightLeft, 
  Printer, 
  Download, 
  Filter, 
  Search, 
  Info, 
  Check, 
  X, 
  Edit3, 
  ShieldAlert,
  Sparkles,
  HelpCircle,
  FileSpreadsheet,
  UserCheck,
  Coffee
} from "lucide-react";

interface ShiftHistoryViewProps {
  ownerId: string;
  karyawanList: Karyawan[];
  absensiList?: Absensi[];
  izinList?: Izin[];
  shiftSettings?: ShiftSettings;
  onRefresh?: () => void;
  isKaryawanMode?: boolean;
  currentKaryawanId?: string;
}

export function ShiftHistoryView({
  ownerId,
  karyawanList = [],
  absensiList: externalAbsensiList,
  izinList: externalIzinList,
  shiftSettings: externalShiftSettings,
  onRefresh,
  isKaryawanMode = false,
  currentKaryawanId
}: ShiftHistoryViewProps) {
  // Navigation & Mode States
  const [viewMode, setViewMode] = useState<"mingguan" | "bulanan" | "staf">("mingguan");
  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    isKaryawanMode && currentKaryawanId ? currentKaryawanId : "all"
  );
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Loaded Data States (if not supplied via props)
  const [internalAbsensi, setInternalAbsensi] = useState<Absensi[]>([]);
  const [internalIzin, setInternalIzin] = useState<Izin[]>([]);
  const [internalSettings, setInternalSettings] = useState<ShiftSettings>(
    externalShiftSettings || DEFAULT_SHIFT_SETTINGS
  );
  const [overrides, setOverrides] = useState<Record<string, ShiftOverride>>({});
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Weeks & Months list
  const pastWeeks = useMemo(() => getPastWeeks(26), []);
  const pastMonths = useMemo(() => getPastMonths(12), []);

  // Selected Period States
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(0); // 0 = Minggu Ini, 1 = 1 Minggu Lalu, ...
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(0); // 0 = Bulan Ini, 1 = 1 Bulan Lalu, ...

  // Modal State for Manual Override / Tukar Shift
  const [editingOverrideStaff, setEditingOverrideStaff] = useState<Karyawan | null>(null);
  const [overrideWeekYMD, setOverrideWeekYMD] = useState<string>("");
  const [overrideShiftType, setOverrideShiftType] = useState<ShiftType>("pagi");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [savingOverride, setSavingOverride] = useState<boolean>(false);

  // Listen to Firestore if needed
  useEffect(() => {
    if (!ownerId || ownerId === "guest") {
      setLoadingData(false);
      return;
    }

    // 1. Shift Overrides Listener
    const overridesRef = collection(db, "users", ownerId, "shift_overrides");
    const unsubOverrides = onSnapshot(overridesRef, (snap) => {
      const map: Record<string, ShiftOverride> = {};
      snap.forEach((d) => {
        const data = d.data() as ShiftOverride;
        map[data.id || d.id] = data;
      });
      setOverrides(map);
      setLoadingData(false);
    }, (err) => {
      console.error("Error loading shift overrides:", err);
      setLoadingData(false);
    });

    // 2. Absensi Listener (if not provided from parent)
    let unsubAbs = () => {};
    if (!externalAbsensiList) {
      const absRef = collection(db, "users", ownerId, "absensi");
      unsubAbs = onSnapshot(absRef, (snap) => {
        const list: Absensi[] = [];
        snap.forEach((d) => list.push(d.data() as Absensi));
        setInternalAbsensi(list);
      });
    }

    // 3. Izin Listener (if not provided from parent)
    let unsubIz = () => {};
    if (!externalIzinList) {
      const izRef = collection(db, "users", ownerId, "izin");
      unsubIz = onSnapshot(izRef, (snap) => {
        const list: Izin[] = [];
        snap.forEach((d) => list.push(d.data() as Izin));
        setInternalIzin(list);
      });
    }

    // 4. Shift Settings Listener (if not provided from parent)
    let unsubSet = () => {};
    if (!externalShiftSettings) {
      const setRef = doc(db, "users", ownerId, "settings", "shift");
      unsubSet = onSnapshot(setRef, (snap) => {
        if (snap.exists()) {
          setInternalSettings({ ...DEFAULT_SHIFT_SETTINGS, ...snap.data() } as ShiftSettings);
        }
      });
    }

    return () => {
      unsubOverrides();
      unsubAbs();
      unsubIz();
      unsubSet();
    };
  }, [ownerId, externalAbsensiList, externalIzinList, externalShiftSettings]);

  // Consolidate data
  const absensiData = externalAbsensiList || internalAbsensi;
  const izinData = externalIzinList || internalIzin;
  const activeSettings = externalShiftSettings || internalSettings;

  // Currently active week & month
  const activeWeek = pastWeeks[selectedWeekIndex] || pastWeeks[0];
  const activeMonth = pastMonths[selectedMonthIndex] || pastMonths[0];

  // Filtered staff list
  const filteredStaffList = useMemo(() => {
    let list = karyawanList;
    if (isKaryawanMode && currentKaryawanId) {
      list = list.filter((k) => k.id === currentKaryawanId);
    } else if (selectedStaffId !== "all") {
      list = list.filter((k) => k.id === selectedStaffId);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (k) =>
          k.nama.toLowerCase().includes(q) ||
          (k.username && k.username.toLowerCase().includes(q))
      );
    }
    return list;
  }, [karyawanList, selectedStaffId, searchQuery, isKaryawanMode, currentKaryawanId]);

  // Map attendance for quick lookup: `${karyawanId}_${ymd}` -> Absensi
  const absensiMap = useMemo(() => {
    const map = new Map<string, Absensi>();
    absensiData.forEach((a) => {
      if (a.karyawanId && a.tanggal) {
        map.set(`${a.karyawanId}_${a.tanggal}`, a);
      }
    });
    return map;
  }, [absensiData]);

  // Map approved leaves: `${karyawanId}_${ymd}` -> Izin
  const izinMap = useMemo(() => {
    const map = new Map<string, Izin>();
    izinData.forEach((iz) => {
      if (iz.karyawanId && iz.status === "Disetujui" && iz.tanggalMulai) {
        // Expand date range if multi-day
        const start = new Date(iz.tanggalMulai);
        const end = iz.tanggalSelesai ? new Date(iz.tanggalSelesai) : start;
        let cur = new Date(start);
        while (cur <= end) {
          const ymd = dateToYMD(cur);
          map.set(`${iz.karyawanId}_${ymd}`, iz);
          cur.setDate(cur.getDate() + 1);
        }
      }
    });
    return map;
  }, [izinData]);

  // Stats calculation for the selected week
  const weekStats = useMemo(() => {
    let totalPagi = 0;
    let totalSiang = 0;
    let totalHadirDays = 0;
    let totalTerlambatDays = 0;
    let totalIzinDays = 0;

    filteredStaffList.forEach((k) => {
      const shiftCalc = calculateEmployeeShiftWithOverride(
        k,
        activeWeek.monday,
        activeSettings,
        overrides
      );
      if (shiftCalc.shift === "pagi") totalPagi++;
      else totalSiang++;

      activeWeek.days.forEach((d) => {
        const abs = absensiMap.get(`${k.id}_${d.ymd}`);
        const iz = izinMap.get(`${k.id}_${d.ymd}`);
        if (abs) {
          totalHadirDays++;
          if (abs.status === "Terlambat") totalTerlambatDays++;
        } else if (iz) {
          totalIzinDays++;
        }
      });
    });

    return {
      totalStaff: filteredStaffList.length,
      totalPagi,
      totalSiang,
      totalHadirDays,
      totalTerlambatDays,
      totalIzinDays
    };
  }, [filteredStaffList, activeWeek, activeSettings, overrides, absensiMap, izinMap]);

  // Month stats calculation
  const monthStats = useMemo(() => {
    let totalPagiWeeks = 0;
    let totalSiangWeeks = 0;
    let totalAttendance = 0;

    activeMonth.weeks.forEach((w) => {
      filteredStaffList.forEach((k) => {
        const shiftCalc = calculateEmployeeShiftWithOverride(
          k,
          w.monday,
          activeSettings,
          overrides
        );
        if (shiftCalc.shift === "pagi") totalPagiWeeks++;
        else totalSiangWeeks++;

        w.days.forEach((d) => {
          if (absensiMap.has(`${k.id}_${d.ymd}`)) {
            totalAttendance++;
          }
        });
      });
    });

    return {
      totalWeeks: activeMonth.weeks.length,
      totalPagiWeeks,
      totalSiangWeeks,
      totalAttendance
    };
  }, [filteredStaffList, activeMonth, activeSettings, overrides, absensiMap]);

  // Open Override Modal
  const handleOpenOverrideModal = (k: Karyawan, weekYMD: string, currentShift: ShiftType) => {
    setEditingOverrideStaff(k);
    setOverrideWeekYMD(weekYMD);
    const existing = overrides[`${k.id}_${weekYMD}`];
    setOverrideShiftType(existing ? existing.shift : (currentShift === "pagi" ? "siang" : "pagi"));
    setOverrideReason(existing?.note || "");
  };

  // Save Shift Override to Firestore
  const handleSaveOverride = async () => {
    if (!editingOverrideStaff || !overrideWeekYMD || !ownerId || ownerId === "guest") return;
    setSavingOverride(true);
    const overrideId = `${editingOverrideStaff.id}_${overrideWeekYMD}`;

    try {
      const ref = doc(db, "users", ownerId, "shift_overrides", overrideId);
      const payload: ShiftOverride = {
        id: overrideId,
        karyawanId: editingOverrideStaff.id,
        mondayYMD: overrideWeekYMD,
        shift: overrideShiftType,
        note: overrideReason.trim() || undefined,
        updatedAt: new Date().toISOString()
      };
      await setDoc(ref, payload);
      setEditingOverrideStaff(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Gagal menyimpan penyesuaian shift:", err);
      alert("Gagal menyimpan penyesuaian shift: " + err);
    } finally {
      setSavingOverride(false);
    }
  };

  // Delete Shift Override (Restore to auto-calculated)
  const handleDeleteOverride = async () => {
    if (!editingOverrideStaff || !overrideWeekYMD || !ownerId || ownerId === "guest") return;
    const confirmRestore = window.confirm(
      `Kembalikan shift ${editingOverrideStaff.nama} pada minggu ini ke jadwal rotasi otomatis bawaan?`
    );
    if (!confirmRestore) return;

    setSavingOverride(true);
    const overrideId = `${editingOverrideStaff.id}_${overrideWeekYMD}`;

    try {
      const ref = doc(db, "users", ownerId, "shift_overrides", overrideId);
      await deleteDoc(ref);
      setEditingOverrideStaff(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Gagal menghapus penyesuaian shift:", err);
      alert("Gagal menghapus penyesuaian shift: " + err);
    } finally {
      setSavingOverride(false);
    }
  };

  // Export CSV Helper
  const handleExportCSV = () => {
    let csv = "";
    if (viewMode === "mingguan") {
      csv = "DATA RIWAYAT SHIFT MINGGUAN - DAMDAM LAUNDRY\n";
      csv += `Periode:;${activeWeek.label}\n`;
      csv += `Rentang:;${activeWeek.shortRange}\n\n`;
      csv += "No;Nama Staf;Username;Shift Terjadwal;Jam Kerja;Status Rotasi;Senin;Selasa;Rabu;Kamis;Jumat;Sabtu;Minggu;Total Hadir;Keterlambatan;Catatan Khusus\n";

      filteredStaffList.forEach((k, idx) => {
        const s = calculateEmployeeShiftWithOverride(k, activeWeek.monday, activeSettings, overrides);
        let hadirCount = 0;
        let lateCount = 0;

        const dayStatuses = activeWeek.days.map((d) => {
          const abs = absensiMap.get(`${k.id}_${d.ymd}`);
          const iz = izinMap.get(`${k.id}_${d.ymd}`);
          if (abs) {
            hadirCount++;
            if (abs.status === "Terlambat") {
              lateCount++;
              return `Terlambat (${new Date(abs.checkInTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })})`;
            }
            return `Hadir (${new Date(abs.checkInTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })})`;
          }
          if (iz) return `Izin (${iz.tipeIzin || "Libur"})`;
          return "Tidak Hadir / Libur";
        });

        const statusRotasi = s.isManualOverride 
          ? "Penyesuaian Manual" 
          : (k.autoRollingShift !== false ? "Rolling Mingguan" : "Shift Tetap");

        csv += `${idx + 1};"${k.nama}";"@${k.username}";"${s.shiftName}";"${s.jamKerja}";"${statusRotasi}";${dayStatuses.map(x => `"${x}"`).join(";")};"${hadirCount}/7 Hari";"${lateCount}x";"${s.overrideNote || "-"}"\n`;
      });
    } else {
      csv = "DATA RIWAYAT SHIFT BULANAN - DAMDAM LAUNDRY\n";
      csv += `Bulan:;${activeMonth.label}\n\n`;
      csv += `No;Nama Staf;Username;${activeMonth.weeks.map((_, i) => `Minggu ${i + 1}`).join(";")};Total Minggu Pagi;Total Minggu Siang;Total Presensi Hadir\n`;

      filteredStaffList.forEach((k, idx) => {
        let pagiCount = 0;
        let siangCount = 0;
        let hadirCount = 0;

        const weekCells = activeMonth.weeks.map((w) => {
          const s = calculateEmployeeShiftWithOverride(k, w.monday, activeSettings, overrides);
          if (s.shift === "pagi") pagiCount++;
          else siangCount++;

          let wHadir = 0;
          w.days.forEach((d) => {
            if (absensiMap.has(`${k.id}_${d.ymd}`)) {
              wHadir++;
              hadirCount++;
            }
          });

          return `${s.shiftName} (${wHadir} hari hadir)`;
        });

        csv += `${idx + 1};"${k.nama}";"@${k.username}";${weekCells.map(x => `"${x}"`).join(";")};${pagiCount};${siangCount};${hadirCount} hari\n`;
      });
    }

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = viewMode === "mingguan" 
      ? `Riwayat_Shift_${activeWeek.ymd}.csv` 
      : `Riwayat_Shift_${activeMonth.ym}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print friendly action
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden text-left font-sans">
      
      {/* 1. Header Banner & View Mode Selector */}
      <div className="bg-[#121214] border border-[#27272A] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/60 border border-emerald-900/80 px-2 py-0.5 font-mono">
                RIWAYAT & ARSIP SHIFT
              </span>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5">
                Damdam Laundry
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white flex items-center gap-2 mt-1">
              <CalendarDays className="w-5 h-5 text-emerald-400 shrink-0" />
              Riwayat Shift Karyawan (Mingguan & Bulanan)
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl mt-0.5">
              Pantau histori jadwal shift staf di setiap minggu dan bulan yang telah lewat, lengkap dengan perbandingan presensi absensi harian dan rekap rotasi bergulir.
            </p>
          </div>

          {/* Action Buttons: Cetak & Unduh CSV */}
          <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white font-mono text-xs font-bold transition-all cursor-pointer shadow-xs"
              title="Ekspor ke format Excel / CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ekspor CSV</span>
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs"
              title="Cetak tampilan ke printer"
            >
              <Printer className="w-3.5 h-3.5 text-black" />
              <span>Cetak</span>
            </button>
          </div>
        </div>

        {/* View Mode Segment Switch */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-[#27272A]">
          <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 border border-zinc-800 text-xs font-bold uppercase font-mono">
            <button
              onClick={() => setViewMode("mingguan")}
              className={`py-1.5 px-3 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === "mingguan" 
                  ? "bg-emerald-500 text-black shadow-xs" 
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Per Minggu</span>
            </button>
            <button
              onClick={() => setViewMode("bulanan")}
              className={`py-1.5 px-3 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === "bulanan" 
                  ? "bg-emerald-500 text-black shadow-xs" 
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Per Bulan</span>
            </button>
            <button
              onClick={() => setViewMode("staf")}
              className={`py-1.5 px-3 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === "staf" 
                  ? "bg-emerald-500 text-black shadow-xs" 
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Per Staf</span>
            </button>
          </div>

          {/* Filter Staff & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isKaryawanMode && (
              <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 px-2.5 py-1.5">
                <Filter className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] font-mono text-zinc-400 uppercase">Staf:</span>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="bg-transparent text-xs font-mono font-bold text-zinc-200 outline-hidden cursor-pointer"
                >
                  <option value="all" className="bg-[#121214] text-white">Semua Staf ({karyawanList.length})</option>
                  {karyawanList.map((k) => (
                    <option key={k.id} value={k.id} className="bg-[#121214] text-white">
                      {k.nama}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari staf..."
                className="bg-zinc-950 border border-zinc-800 text-xs text-white pl-8 pr-3 py-1.5 w-full sm:w-40 font-mono outline-hidden focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. MODE SPECIFIC VIEWS */}

      {/* A. MODE PER MINGGU */}
      {viewMode === "mingguan" && (
        <div className="space-y-4">
          {/* Week Selector Bar */}
          <div className="bg-[#121214] border border-[#27272A] p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedWeekIndex((prev) => Math.min(prev + 1, pastWeeks.length - 1))}
                disabled={selectedWeekIndex >= pastWeeks.length - 1}
                className="p-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer transition-all"
                title="Lihat minggu lebih lampau"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="flex-1 sm:flex-initial">
                <select
                  value={selectedWeekIndex}
                  onChange={(e) => setSelectedWeekIndex(Number(e.target.value))}
                  className="w-full sm:w-auto bg-zinc-950 border border-zinc-700 text-xs font-mono font-bold text-emerald-400 px-3 py-2 outline-hidden cursor-pointer"
                >
                  {pastWeeks.map((w, idx) => (
                    <option key={w.ymd} value={idx} className="bg-[#121214] text-white">
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setSelectedWeekIndex((prev) => Math.max(prev - 1, 0))}
                disabled={selectedWeekIndex <= 0}
                className="p-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer transition-all"
                title="Lihat minggu lebih baru"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono flex-wrap">
              <div className="flex items-center gap-1.5 text-zinc-300 bg-zinc-900 border border-zinc-800 px-2.5 py-1">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>{activeWeek.shortRange}</span>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 border ${
                activeWeek.weeksAgo === 0 
                  ? "bg-emerald-950 text-emerald-400 border-emerald-800" 
                  : "bg-zinc-900 text-zinc-400 border-zinc-800"
              }`}>
                {activeWeek.weeksAgo === 0 ? "Minggu Berjalan" : `${activeWeek.weeksAgo} Minggu Lalu`}
              </span>
            </div>
          </div>

          {/* Week Statistics Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#121214] border border-[#27272A] p-3">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block">Staf Terjadwal</span>
              <div className="text-xl font-black text-white font-mono mt-0.5">
                {weekStats.totalStaff} <span className="text-xs font-normal text-zinc-400">orang</span>
              </div>
            </div>
            <div className="bg-[#121214] border border-[#27272A] p-3">
              <span className="text-[10px] font-mono uppercase text-emerald-400 block flex items-center gap-1">
                <Sun className="w-3 h-3 text-emerald-400" /> Shift Pagi
              </span>
              <div className="text-xl font-black text-emerald-300 font-mono mt-0.5">
                {weekStats.totalPagi} <span className="text-xs font-normal text-zinc-400">staf</span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">{activeSettings.pagiStartTime} - {activeSettings.pagiEndTime} WIB</span>
            </div>
            <div className="bg-[#121214] border border-[#27272A] p-3">
              <span className="text-[10px] font-mono uppercase text-amber-400 block flex items-center gap-1">
                <Sunset className="w-3 h-3 text-amber-400" /> Shift Siang
              </span>
              <div className="text-xl font-black text-amber-300 font-mono mt-0.5">
                {weekStats.totalSiang} <span className="text-xs font-normal text-zinc-400">staf</span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">{activeSettings.siangStartTime} - {activeSettings.siangEndTime} WIB</span>
            </div>
            <div className="bg-[#121214] border border-[#27272A] p-3">
              <span className="text-[10px] font-mono uppercase text-blue-400 block flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-blue-400" /> Presensi Hadir
              </span>
              <div className="text-xl font-black text-blue-300 font-mono mt-0.5">
                {weekStats.totalHadirDays} <span className="text-xs font-normal text-zinc-400">hari</span>
              </div>
              <span className="text-[10px] text-amber-400 font-mono">{weekStats.totalTerlambatDays}x terlambat</span>
            </div>
          </div>

          {/* Weekly Staff Cards / Table */}
          <div className="space-y-3">
            {filteredStaffList.length === 0 ? (
              <div className="bg-[#121214] border border-[#27272A] p-8 text-center text-zinc-500 text-xs font-mono">
                Tidak ada staf yang sesuai dengan filter.
              </div>
            ) : (
              filteredStaffList.map((k) => {
                const shiftCalc = calculateEmployeeShiftWithOverride(
                  k,
                  activeWeek.monday,
                  activeSettings,
                  overrides
                );
                const isTidakAda = shiftCalc.shift === "tidak_ada";
                const isPagi = shiftCalc.shift === "pagi";

                // Count attendance in this specific week
                let hadirThisWeek = 0;
                let lateThisWeek = 0;
                let izinThisWeek = 0;

                activeWeek.days.forEach((d) => {
                  const a = absensiMap.get(`${k.id}_${d.ymd}`);
                  const iz = izinMap.get(`${k.id}_${d.ymd}`);
                  if (a) {
                    hadirThisWeek++;
                    if (a.status === "Terlambat") lateThisWeek++;
                  } else if (iz) {
                    izinThisWeek++;
                  }
                });

                return (
                  <div 
                    key={k.id}
                    className="bg-[#121214] border border-[#27272A] p-4 space-y-3.5 transition-all hover:border-zinc-700"
                  >
                    {/* Top Row: Staf info + Shift Badge + Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-white uppercase tracking-tight">{k.nama}</h4>
                          <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-1.5 py-0.5">
                            @{k.username}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900 px-1.5 py-0.5">
                            {k.posisi || "Staf Laundry"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs font-mono text-zinc-400">
                          <span>Status:</span>
                          <span className="text-zinc-200 font-bold">
                            {shiftCalc.isManualOverride ? (
                              <span className="text-amber-400">✏️ Penyesuaian Khusus ({shiftCalc.overrideNote || "Tukar Shift"})</span>
                            ) : k.autoRollingShift !== false ? (
                              <span className="text-emerald-400">🔄 Rolling Otomatis Mingguan</span>
                            ) : (
                              <span className="text-zinc-400">Shift Tetap (Non-rolling)</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {/* Assigned Shift Badge */}
                        <div className={`px-3 py-1.5 border font-mono flex items-center gap-2 ${
                          isTidakAda
                            ? "bg-zinc-900/90 text-zinc-300 border-zinc-700"
                            : isPagi 
                              ? "bg-emerald-950/70 text-emerald-300 border-emerald-800/90" 
                              : "bg-amber-950/70 text-amber-300 border-amber-800/90"
                        }`}>
                          {isTidakAda ? (
                            <Coffee className="w-4 h-4 text-zinc-400 shrink-0" />
                          ) : isPagi ? (
                            <Sun className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <Sunset className="w-4 h-4 text-amber-400 shrink-0" />
                          )}
                          <div>
                            <span className="text-xs font-black uppercase block tracking-wider leading-tight">
                              {shiftCalc.shiftName}
                            </span>
                            <span className="text-[10px] opacity-80 block font-normal mt-0.5">
                              {shiftCalc.jamKerja}
                            </span>
                          </div>
                        </div>

                        {/* Owner action: Override / Adjust Shift for this week */}
                        {!isKaryawanMode && (
                          <button
                            onClick={() => handleOpenOverrideModal(k, activeWeek.ymd, shiftCalc.shift)}
                            className="p-1.5 px-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all"
                            title="Tukar shift, liburkan, atau catat penyesuaian untuk minggu ini"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Ubah / Libur</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 7 Days Attendance Timeline for this week */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-2">
                        <span>Presensi Harian Minggu Ini:</span>
                        <span className="font-bold text-zinc-300">
                          {hadirThisWeek}/7 Hari Hadir {lateThisWeek > 0 && <span className="text-amber-400">({lateThisWeek}x Telat)</span>}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5 font-mono">
                        {activeWeek.days.map((d) => {
                          const abs = absensiMap.get(`${k.id}_${d.ymd}`);
                          const iz = izinMap.get(`${k.id}_${d.ymd}`);
                          const isToday = d.ymd === dateToYMD(new Date());

                          return (
                            <div
                              key={d.ymd}
                              className={`p-2 border text-left flex flex-col justify-between min-h-[64px] transition-all ${
                                abs 
                                  ? abs.status === "Terlambat"
                                    ? "bg-amber-950/30 border-amber-800/60 text-amber-200"
                                    : "bg-emerald-950/30 border-emerald-800/60 text-emerald-200"
                                  : iz
                                    ? "bg-blue-950/30 border-blue-800/60 text-blue-200"
                                    : isToday
                                      ? "bg-zinc-900 border-zinc-600 text-zinc-300"
                                      : "bg-zinc-950 border-zinc-800/80 text-zinc-500"
                              }`}
                            >
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="font-black uppercase">{d.dayName.slice(0, 3)}</span>
                                <span className="text-zinc-400">{d.dayNumber}</span>
                              </div>

                              <div className="mt-1">
                                {abs ? (
                                  <div>
                                    <span className={`text-[10px] font-black uppercase block ${
                                      abs.status === "Terlambat" ? "text-amber-400" : "text-emerald-400"
                                    }`}>
                                      {abs.status === "Terlambat" ? "⚠️ Telat" : "✅ Hadir"}
                                    </span>
                                    <span className="text-[10px] opacity-90 block font-mono">
                                      {new Date(abs.checkInTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </div>
                                ) : iz ? (
                                  <div>
                                    <span className="text-[10px] font-black text-blue-400 block">🏖️ Izin</span>
                                    <span className="text-[9px] opacity-75 truncate block" title={iz.alasan}>
                                      {iz.tipeIzin || "Libur"}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-zinc-600 block">
                                    {isToday ? "Belum Absen" : "—"}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* B. MODE PER BULAN */}
      {viewMode === "bulanan" && (
        <div className="space-y-4">
          {/* Month Selector Bar */}
          <div className="bg-[#121214] border border-[#27272A] p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedMonthIndex((prev) => Math.min(prev + 1, pastMonths.length - 1))}
                disabled={selectedMonthIndex >= pastMonths.length - 1}
                className="p-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer transition-all"
                title="Lihat bulan lebih lampau"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex-1 sm:flex-initial">
                <select
                  value={selectedMonthIndex}
                  onChange={(e) => setSelectedMonthIndex(Number(e.target.value))}
                  className="w-full sm:w-auto bg-zinc-950 border border-zinc-700 text-xs font-mono font-bold text-emerald-400 px-3 py-2 outline-hidden cursor-pointer"
                >
                  {pastMonths.map((m, idx) => (
                    <option key={m.ym} value={idx} className="bg-[#121214] text-white">
                      {m.label} {m.monthsAgo === 0 ? "(Bulan Ini)" : `(${m.monthsAgo} Bulan Lalu)`}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setSelectedMonthIndex((prev) => Math.max(prev - 1, 0))}
                disabled={selectedMonthIndex <= 0}
                className="p-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer transition-all"
                title="Lihat bulan lebih baru"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono flex-wrap">
              <span className="text-zinc-300 bg-zinc-900 border border-zinc-800 px-2.5 py-1">
                {activeMonth.weeks.length} Minggu Kerja Terdata
              </span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 border ${
                activeMonth.monthsAgo === 0 
                  ? "bg-emerald-950 text-emerald-400 border-emerald-800" 
                  : "bg-zinc-900 text-zinc-400 border-zinc-800"
              }`}>
                {activeMonth.monthsAgo === 0 ? "Bulan Berjalan" : `${activeMonth.monthsAgo} Bulan Lalu`}
              </span>
            </div>
          </div>

          {/* Month Statistics Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#121214] border border-[#27272A] p-3">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block">Total Minggu Kerja</span>
              <div className="text-xl font-black text-white font-mono mt-0.5">
                {monthStats.totalWeeks} <span className="text-xs font-normal text-zinc-400">minggu</span>
              </div>
            </div>
            <div className="bg-[#121214] border border-[#27272A] p-3">
              <span className="text-[10px] font-mono uppercase text-emerald-400 block flex items-center gap-1">
                <Sun className="w-3 h-3 text-emerald-400" /> Total Minggu Pagi
              </span>
              <div className="text-xl font-black text-emerald-300 font-mono mt-0.5">
                {monthStats.totalPagiWeeks} <span className="text-xs font-normal text-zinc-400">slot</span>
              </div>
            </div>
            <div className="bg-[#121214] border border-[#27272A] p-3">
              <span className="text-[10px] font-mono uppercase text-amber-400 block flex items-center gap-1">
                <Sunset className="w-3 h-3 text-amber-400" /> Total Minggu Siang
              </span>
              <div className="text-xl font-black text-amber-300 font-mono mt-0.5">
                {monthStats.totalSiangWeeks} <span className="text-xs font-normal text-zinc-400">slot</span>
              </div>
            </div>
            <div className="bg-[#121214] border border-[#27272A] p-3">
              <span className="text-[10px] font-mono uppercase text-blue-400 block flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-blue-400" /> Total Presensi Tercatat
              </span>
              <div className="text-xl font-black text-blue-300 font-mono mt-0.5">
                {monthStats.totalAttendance} <span className="text-xs font-normal text-zinc-400">kehadiran</span>
              </div>
            </div>
          </div>

          {/* Monthly Matrix Table */}
          <div className="bg-[#121214] border border-[#27272A] overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] font-black tracking-wider">
                  <th className="p-3 border-r border-zinc-800/80 min-w-[150px]">Staf</th>
                  {activeMonth.weeks.map((w, idx) => (
                    <th key={w.ymd} className="p-3 border-r border-zinc-800/80 min-w-[140px]">
                      <div>Minggu {idx + 1}</div>
                      <div className="text-[9px] text-zinc-500 font-normal">{w.shortRange}</div>
                    </th>
                  ))}
                  <th className="p-3 border-r border-zinc-800/80 min-w-[110px] text-center">Rekap Shift</th>
                  <th className="p-3 min-w-[100px] text-center">Total Presensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredStaffList.map((k) => {
                  let staffPagiWeeks = 0;
                  let staffSiangWeeks = 0;
                  let staffHadirTotal = 0;

                  return (
                    <tr key={k.id} className="hover:bg-zinc-900/40 transition-colors">
                      {/* Staff Name & Username */}
                      <td className="p-3 border-r border-zinc-800/80">
                        <div className="font-bold text-white uppercase text-xs">{k.nama}</div>
                        <div className="text-[10px] text-zinc-400">@{k.username}</div>
                      </td>

                      {/* Each Week's Shift & Attendance */}
                      {activeMonth.weeks.map((w) => {
                        const shiftCalc = calculateEmployeeShiftWithOverride(
                          k,
                          w.monday,
                          activeSettings,
                          overrides
                        );
                        const isTidakAda = shiftCalc.shift === "tidak_ada";
                        const isPagi = shiftCalc.shift === "pagi";
                        if (isPagi) staffPagiWeeks++;
                        else if (!isTidakAda) staffSiangWeeks++;

                        // Count attendance in this week
                        let weekHadir = 0;
                        w.days.forEach((d) => {
                          if (absensiMap.has(`${k.id}_${d.ymd}`)) {
                            weekHadir++;
                            staffHadirTotal++;
                          }
                        });

                        return (
                          <td key={w.ymd} className="p-3 border-r border-zinc-800/80 align-top">
                            <div className="space-y-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-xs border ${
                                isTidakAda
                                  ? "bg-zinc-900 text-zinc-400 border-zinc-700"
                                  : isPagi
                                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/90"
                                    : "bg-amber-950/80 text-amber-300 border-amber-800/90"
                              }`}>
                                {isTidakAda ? <Coffee className="w-3 h-3 text-zinc-400" /> : isPagi ? <Sun className="w-3 h-3 text-emerald-400" /> : <Sunset className="w-3 h-3 text-amber-400" />}
                                <span>{isTidakAda ? "Libur" : isPagi ? "Pagi" : "Siang"}</span>
                              </span>
                              {shiftCalc.isManualOverride && (
                                <span className="block text-[9px] text-amber-400 font-bold">
                                  ✏️ Tukar
                                </span>
                              )}
                              <div className="text-[10px] text-zinc-400">
                                {weekHadir}/7 hari hadir
                              </div>
                            </div>
                          </td>
                        );
                      })}

                      {/* Shift Balance Summary */}
                      <td className="p-3 border-r border-zinc-800/80 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-[11px] text-emerald-400 font-bold" title="Minggu Shift Pagi">
                            {staffPagiWeeks}x Pagi
                          </span>
                          <span className="text-zinc-600">|</span>
                          <span className="text-[11px] text-amber-400 font-bold" title="Minggu Shift Siang">
                            {staffSiangWeeks}x Siang
                          </span>
                        </div>
                        <div className="text-[9px] text-zinc-500 mt-0.5">
                          {staffPagiWeeks === staffSiangWeeks ? "⚖️ 50:50 Seimbang" : "Rotasi Aktif"}
                        </div>
                      </td>

                      {/* Total Presensi */}
                      <td className="p-3 text-center font-bold text-white">
                        {staffHadirTotal} <span className="text-[10px] font-normal text-zinc-400">hari</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* C. MODE PER STAF (TIMELINE ROTASI) */}
      {viewMode === "staf" && (
        <div className="space-y-4">
          <div className="bg-[#121214] border border-[#27272A] p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-zinc-400 block">PILIH STAF UNTUK TIMELINE ROTASI</span>
                <h3 className="text-base font-black uppercase text-white tracking-wide mt-0.5">
                  Rekapitulasi Riwayat Shift Individu
                </h3>
              </div>
              <div className="w-full sm:w-auto">
                <select
                  value={selectedStaffId === "all" ? (karyawanList[0]?.id || "") : selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="w-full sm:w-60 bg-zinc-950 border border-zinc-700 text-xs font-mono font-bold text-emerald-400 px-3 py-2 outline-hidden cursor-pointer"
                >
                  {karyawanList.map((k) => (
                    <option key={k.id} value={k.id} className="bg-[#121214] text-white">
                      {k.nama} (@{k.username})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Timeline Feed of Weeks for this Staff */}
          {(() => {
            const currentStaff = karyawanList.find(
              (k) => k.id === (selectedStaffId === "all" ? karyawanList[0]?.id : selectedStaffId)
            );

            if (!currentStaff) {
              return (
                <div className="bg-[#121214] border border-[#27272A] p-8 text-center text-zinc-500 text-xs font-mono">
                  Silakan pilih staf terlebih dahulu.
                </div>
              );
            }

            return (
              <div className="space-y-2.5">
                {pastWeeks.slice(0, 16).map((w) => {
                  const s = calculateEmployeeShiftWithOverride(currentStaff, w.monday, activeSettings, overrides);
                  const isTidakAda = s.shift === "tidak_ada";
                  const isPagi = s.shift === "pagi";

                  // Attendance count in this week
                  let hadirCount = 0;
                  let lateCount = 0;
                  w.days.forEach((d) => {
                    const abs = absensiMap.get(`${currentStaff.id}_${d.ymd}`);
                    if (abs) {
                      hadirCount++;
                      if (abs.status === "Terlambat") lateCount++;
                    }
                  });

                  return (
                    <div 
                      key={w.ymd}
                      className="bg-[#121214] border border-[#27272A] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 border rounded-xs ${
                          isTidakAda
                            ? "bg-zinc-900 text-zinc-400 border-zinc-700"
                            : isPagi 
                              ? "bg-emerald-950 text-emerald-400 border-emerald-800" 
                              : "bg-amber-950 text-amber-400 border-amber-800"
                        }`}>
                          {isTidakAda ? <Coffee className="w-4 h-4" /> : isPagi ? <Sun className="w-4 h-4" /> : <Sunset className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase text-white">{w.label}</span>
                            {w.weeksAgo === 0 && (
                              <span className="text-[9px] bg-emerald-500 text-black px-1.5 py-0.2 font-black uppercase">
                                Aktif Sekarang
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-zinc-400 block mt-0.5">
                            {w.shortRange}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
                        <div className="text-right">
                          <span className={`text-xs font-black uppercase block ${isTidakAda ? "text-zinc-400" : isPagi ? "text-emerald-300" : "text-amber-300"}`}>
                            {s.shiftName} ({s.jamKerja})
                          </span>
                          <span className="text-[10px] text-zinc-400 block mt-0.5">
                            {hadirCount}/7 hari hadir {lateCount > 0 && `(${lateCount}x telat)`}
                          </span>
                        </div>

                        {s.isManualOverride && (
                          <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-1">
                            ✏️ {s.overrideNote || "Penyesuaian"}
                          </span>
                        )}

                        {!isKaryawanMode && (
                          <button
                            onClick={() => handleOpenOverrideModal(currentStaff, w.ymd, s.shift)}
                            className="p-1.5 px-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-[10px] cursor-pointer"
                            title="Ubah jadwal shift minggu ini"
                          >
                            Edit Shift
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* 3. MODAL PENYESUAIAN / TUKAR SHIFT MANUAL UNTUK MINGGU TERPILIH */}
      {editingOverrideStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs font-sans">
          <div className="bg-[#121214] border border-[#27272A] w-full max-w-md p-5 space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-black uppercase text-white tracking-wider">
                  Penyesuaian / Tukar Shift Manual
                </h3>
              </div>
              <button
                onClick={() => setEditingOverrideStaff(null)}
                className="text-zinc-500 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <span className="text-zinc-400 text-[10px] uppercase block">Karyawan</span>
                <p className="text-white font-bold text-sm mt-0.5">{editingOverrideStaff.nama} (@{editingOverrideStaff.username})</p>
              </div>

              <div>
                <span className="text-zinc-400 text-[10px] uppercase block">Minggu Terpilih (Mulai Senin)</span>
                <p className="text-emerald-400 font-bold mt-0.5">{overrideWeekYMD}</p>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="text-zinc-300 text-[11px] font-bold block">
                  Pilih Shift untuk Minggu Ini:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOverrideShiftType("pagi")}
                    className={`p-2.5 border font-mono text-left cursor-pointer transition-all ${
                      overrideShiftType === "pagi"
                        ? "bg-emerald-950 text-emerald-300 border-emerald-500 shadow-sm"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-black uppercase text-xs">
                      <Sun className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Shift Pagi</span>
                    </div>
                    <span className="text-[10px] opacity-80 block mt-1">
                      {activeSettings.pagiStartTime} - {activeSettings.pagiEndTime} WIB
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOverrideShiftType("siang")}
                    className={`p-2.5 border font-mono text-left cursor-pointer transition-all ${
                      overrideShiftType === "siang"
                        ? "bg-amber-950 text-amber-300 border-amber-500 shadow-sm"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-black uppercase text-xs">
                      <Sunset className="w-3.5 h-3.5 text-amber-400" />
                      <span>Shift Siang</span>
                    </div>
                    <span className="text-[10px] opacity-80 block mt-1">
                      {activeSettings.siangStartTime} - {activeSettings.siangEndTime} WIB
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOverrideShiftType("tidak_ada")}
                    className={`p-2.5 border font-mono text-left cursor-pointer transition-all ${
                      overrideShiftType === "tidak_ada"
                        ? "bg-zinc-800 text-white border-zinc-400 shadow-sm"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-black uppercase text-xs">
                      <Coffee className="w-3.5 h-3.5 text-zinc-300" />
                      <span>Tidak Ada Shift</span>
                    </div>
                    <span className="text-[10px] opacity-80 block mt-1">
                      Libur / Bebas Tugas
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <label className="text-zinc-300 text-[11px] font-bold block">
                  Alasan / Keterangan Penyesuaian:
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Contoh: Tukar shift dengan Siti / Izin acara keluarga"
                  className="w-full bg-zinc-950 border border-zinc-700 text-white px-3 py-2 text-xs font-mono outline-hidden focus:border-emerald-500"
                />
              </div>

              <p className="text-[10px] text-zinc-500 leading-relaxed pt-1">
                *Penyesuaian manual ini hanya berlaku khusus untuk minggu yang dipilih. Minggu-minggu lainnya tetap mengikuti rotasi otomatis.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-800">
              {overrides[`${editingOverrideStaff.id}_${overrideWeekYMD}`] ? (
                <button
                  type="button"
                  onClick={handleDeleteOverride}
                  disabled={savingOverride}
                  className="px-3 py-2 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 text-xs font-mono font-bold cursor-pointer"
                >
                  Hapus Penyesuaian
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingOverrideStaff(null)}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveOverride}
                  disabled={savingOverride}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-black uppercase font-mono tracking-wider cursor-pointer"
                >
                  {savingOverride ? "Menyimpan..." : "Simpan Penyesuaian"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
