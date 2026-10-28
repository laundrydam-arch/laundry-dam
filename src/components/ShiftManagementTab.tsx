import React, { useState, useEffect, useRef } from "react";
import { 
  Karyawan, 
  ShiftSettings, 
  ShiftType 
} from "../types";
import { 
  DEFAULT_SHIFT_SETTINGS,
  DEFAULT_SHIFT_REMINDER_TEMPLATE,
  calculateEmployeeShift, 
  buildShiftReminderWhatsAppMessage,
  getMondayOfDate,
  getSundayOfDate,
  getNextWeekMonday,
  formatWeekRange,
  formatIndonesianDate,
  dateToYMD
} from "../utils/shiftUtils";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Clock, 
  Calendar, 
  Send, 
  Sun, 
  Sunset, 
  RotateCw, 
  CheckCircle2, 
  AlertCircle, 
  Settings, 
  Phone, 
  ExternalLink,
  Users,
  Sparkles,
  Info,
  ChevronRight,
  RefreshCw,
  Eye,
  Check,
  MessageSquare,
  Copy,
  FileText,
  RotateCcw,
  CheckCheck,
  Edit3,
  History,
  Coffee,
  X,
  Ban
} from "lucide-react";
import { ShiftHistoryView } from "./ShiftHistoryView";

interface ShiftManagementTabProps {
  ownerId: string;
  karyawanList: Karyawan[];
  onRefreshKaryawan?: () => void;
  onNavigateToWhatsAppTab?: () => void;
}

export function ShiftManagementTab({ 
  ownerId, 
  karyawanList,
  onRefreshKaryawan,
  onNavigateToWhatsAppTab 
}: ShiftManagementTabProps) {
  // Shift Settings state
  const [shiftSettings, setShiftSettings] = useState<ShiftSettings>(DEFAULT_SHIFT_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [waGatewayConfig, setWaGatewayConfig] = useState<{ isEnabled: boolean; fonnteToken: string; gateway: string } | null>(null);

  // Broadcast & Action States
  const [shiftSubTab, setShiftSubTab] = useState<"aktif" | "riwayat">("aktif");
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [broadcastResult, setBroadcastResult] = useState<{ success: boolean; message: string; results?: any[] } | null>(null);
  const [sendingSingleId, setSendingSingleId] = useState<string | null>(null);

  // Modal / Preview States
  const [selectedStaffForPreview, setSelectedStaffForPreview] = useState<Karyawan | null>(null);
  const [customMsgPreview, setCustomMsgPreview] = useState<string>("");
  const [previewWeekTarget, setPreviewWeekTarget] = useState<"next" | "current">("next");
  const [copiedMsg, setCopiedMsg] = useState<boolean>(false);

  // Template Editor State
  const [showTemplateLivePreview, setShowTemplateLivePreview] = useState<boolean>(false);
  const templateTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Inline edit state for phone numbers
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneInputVal, setPhoneInputVal] = useState<string>("");
  const [savingPhone, setSavingPhone] = useState<boolean>(false);

  // Edit Shift Modal state
  const [editingShiftStaff, setEditingShiftStaff] = useState<Karyawan | null>(null);
  const [selectedNewShift, setSelectedNewShift] = useState<ShiftType>("pagi");
  const [selectedAutoRolling, setSelectedAutoRolling] = useState<boolean>(true);
  const [savingEmployeeShift, setSavingEmployeeShift] = useState<boolean>(false);

  // Date anchors
  const currentMonday = getMondayOfDate(new Date());
  const nextMonday = getNextWeekMonday(new Date());

  // Compact date range helper for headers
  const getCompactRange = (monday: Date) => {
    const sunday = getSundayOfDate(monday);
    return `${formatIndonesianDate(monday, true)} – ${formatIndonesianDate(sunday, true)}`;
  };

  // Load Shift & WA Settings from Firestore
  useEffect(() => {
    if (!ownerId || ownerId === "guest") return;
    const fetchSettings = async () => {
      try {
        // Shift Settings
        const shiftDocRef = doc(db, "users", ownerId, "settings", "shift");
        const snap = await getDoc(shiftDocRef);
        if (snap.exists()) {
          setShiftSettings({ ...DEFAULT_SHIFT_SETTINGS, ...snap.data() } as ShiftSettings);
        }

        // WhatsApp Gateway Settings
        const waDocRef = doc(db, "users", ownerId, "settings", "whatsapp");
        const waSnap = await getDoc(waDocRef);
        if (waSnap.exists()) {
          const waData = waSnap.data();
          setWaGatewayConfig({
            isEnabled: !!waData.isEnabled,
            fonnteToken: waData.fonnteToken || "",
            gateway: waData.gateway || "fonnte"
          });
        }
      } catch (err) {
        console.error("Gagal memuat pengaturan shift:", err);
      } finally {
        setLoadingSettings(false);
      }
    };
    fetchSettings();
  }, [ownerId]);

  // Save Shift Settings to Firestore
  const handleSaveShiftSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId || ownerId === "guest") return;
    setSavingSettings(true);
    try {
      const shiftDocRef = doc(db, "users", ownerId, "settings", "shift");
      await setDoc(shiftDocRef, shiftSettings, { merge: true });
      alert("Pengaturan jam shift dan pengingat Minggu malam berhasil disimpan!");
    } catch (err) {
      console.error("Gagal menyimpan pengaturan shift:", err);
      alert("Gagal menyimpan pengaturan shift: " + err);
    } finally {
      setSavingSettings(false);
    }
  };

  // Open Edit Shift Modal
  const handleOpenEditShiftModal = (k: Karyawan) => {
    setEditingShiftStaff(k);
    setSelectedNewShift(k.currentShift || "pagi");
    setSelectedAutoRolling(k.autoRollingShift !== false && k.currentShift !== "tidak_ada");
  };

  // Save Employee Shift (Pagi, Siang, or Tidak Ada Shift)
  const handleSaveEmployeeShift = async () => {
    if (!ownerId || ownerId === "guest" || !editingShiftStaff) return;
    setSavingEmployeeShift(true);
    try {
      const karRef = doc(db, "users", ownerId, "karyawan", editingShiftStaff.id);
      const currentMondayYMD = dateToYMD(currentMonday);
      const isAuto = selectedNewShift === "tidak_ada" ? false : selectedAutoRolling;

      await updateDoc(karRef, {
        currentShift: selectedNewShift,
        shiftAnchorDate: currentMondayYMD,
        autoRollingShift: isAuto
      });

      setEditingShiftStaff(null);
      if (onRefreshKaryawan) onRefreshKaryawan();
    } catch (err) {
      console.error("Gagal menyimpan perubahan shift staf:", err);
      alert("Gagal menyimpan perubahan shift: " + err);
    } finally {
      setSavingEmployeeShift(false);
    }
  };

  // Toggle Employee's Base Shift (Pagi <-> Siang)
  const handleToggleBaseShift = async (k: Karyawan) => {
    if (!ownerId || ownerId === "guest") return;
    const currentShiftVal = k.currentShift || "pagi";
    const nextShiftVal: ShiftType = currentShiftVal === "pagi" ? "siang" : "pagi";
    const currentMondayYMD = dateToYMD(currentMonday);

    try {
      const karRef = doc(db, "users", ownerId, "karyawan", k.id);
      await updateDoc(karRef, {
        currentShift: nextShiftVal,
        shiftAnchorDate: currentMondayYMD,
        autoRollingShift: true
      });
      if (onRefreshKaryawan) onRefreshKaryawan();
    } catch (err) {
      console.error("Gagal mengubah shift dasar:", err);
      alert("Gagal mengubah shift: " + err);
    }
  };

  // Toggle Employee's Auto Rolling status
  const handleToggleAutoRolling = async (k: Karyawan) => {
    if (!ownerId || ownerId === "guest") return;
    const currentStatus = k.autoRollingShift !== false;
    try {
      const karRef = doc(db, "users", ownerId, "karyawan", k.id);
      await updateDoc(karRef, {
        autoRollingShift: !currentStatus
      });
      if (onRefreshKaryawan) onRefreshKaryawan();
    } catch (err) {
      console.error("Gagal mengubah status auto rolling:", err);
      alert("Gagal mengubah status: " + err);
    }
  };

  // Save Employee Phone Number
  const handleSavePhone = async (kId: string) => {
    if (!ownerId || ownerId === "guest") return;
    setSavingPhone(true);
    try {
      const cleanPhone = phoneInputVal.trim();
      const karRef = doc(db, "users", ownerId, "karyawan", kId);
      await updateDoc(karRef, {
        telepon: cleanPhone
      });
      setEditingPhoneId(null);
      if (onRefreshKaryawan) onRefreshKaryawan();
    } catch (err) {
      console.error("Gagal menyimpan nomor HP:", err);
      alert("Gagal menyimpan nomor WhatsApp: " + err);
    } finally {
      setSavingPhone(false);
    }
  };

  // Open Preview Modal
  const handleOpenPreview = (k: Karyawan, target: "next" | "current" = "next") => {
    setSelectedStaffForPreview(k);
    setPreviewWeekTarget(target);
    const targetMondayDate = target === "next" ? nextMonday : currentMonday;
    const msg = buildShiftReminderWhatsAppMessage(k, targetMondayDate, shiftSettings);
    setCustomMsgPreview(msg);
  };

  // Copy Message to Clipboard
  const handleCopyMessage = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2500);
    } catch (err) {
      console.error("Gagal menyalin teks:", err);
      alert("Pesan berhasil dipilih, gunakan Ctrl+C untuk menyalin.");
    }
  };

  // Insert Variable Token into Template Textarea
  const handleInsertVariable = (variableToken: string) => {
    const textarea = templateTextareaRef.current;
    const currentTemplate = shiftSettings.reminderMessageTemplate || DEFAULT_SHIFT_REMINDER_TEMPLATE;
    
    if (!textarea) {
      setShiftSettings(prev => ({
        ...prev,
        reminderMessageTemplate: (prev.reminderMessageTemplate || DEFAULT_SHIFT_REMINDER_TEMPLATE) + " " + variableToken
      }));
      return;
    }

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const newText = currentTemplate.substring(0, start) + variableToken + currentTemplate.substring(end);
    
    setShiftSettings(prev => ({
      ...prev,
      reminderMessageTemplate: newText
    }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableToken.length, start + variableToken.length);
    }, 50);
  };

  // Reset Template to Standard Format
  const handleResetTemplateToDefault = () => {
    const confirmReset = window.confirm("Kembalikan format isi pesan reminder ke template bawaan standar?");
    if (confirmReset) {
      setShiftSettings(prev => ({
        ...prev,
        reminderMessageTemplate: DEFAULT_SHIFT_REMINDER_TEMPLATE
      }));
    }
  };

  // Send Single Reminder via Server API Gateway
  const handleSendSingleReminder = async (k: Karyawan, customMessage?: string) => {
    if (!k.telepon) {
      alert(`Staf ${k.nama} belum memiliki nomor WhatsApp.`);
      return;
    }
    setSendingSingleId(k.id);
    try {
      const resp = await fetch("/api/whatsapp/send-single-shift-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: ownerId,
          karyawanId: k.id,
          customMessage: customMessage || undefined
        })
      });
      const data = await resp.json();
      if (data.success) {
        alert(`Berhasil mengirimkan pengingat shift ke WhatsApp ${k.nama} (${k.telepon})!`);
      } else {
        const msgText = customMessage || buildShiftReminderWhatsAppMessage(k, nextMonday, shiftSettings);
        const confirmManual = window.confirm(
          `Pengiriman otomatis via Gateway gagal:\n${data.error || "Token belum diatur atau kuota tidak mencukupi"}\n\nApakah Anda ingin membuka & mengirimkan pesan ini langsung ke WhatsApp ${k.nama} sekarang?`
        );
        if (confirmManual) {
          window.open(getDirectWhatsAppUrl(k.telepon, msgText), "_blank");
        }
      }
    } catch (err: any) {
      alert("Terjadi kesalahan saat menghubungi server: " + err.message);
    } finally {
      setSendingSingleId(null);
    }
  };

  // Broadcast to All Staff via Server API
  const handleBroadcastAll = async () => {
    const validCount = karyawanList.filter(k => k.telepon && k.telepon.trim().length >= 8).length;
    if (validCount === 0) {
      alert("Tidak ada karyawan yang memiliki nomor WhatsApp terdaftar. Silakan lengkapi nomor WhatsApp karyawan terlebih dahulu.");
      return;
    }

    const confirmSend = window.confirm(
      `Kirim notifikasi jadwal shift minggu depan via WhatsApp ke ${validCount} karyawan sekarang?`
    );
    if (!confirmSend) return;

    setIsBroadcasting(true);
    setBroadcastResult(null);

    try {
      const resp = await fetch("/api/whatsapp/send-shift-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: ownerId,
          forceSend: true
        })
      });
      const data = await resp.json();
      if (data.success && data.report) {
        setBroadcastResult({
          success: data.report.status === "sent",
          message: data.report.message,
          results: data.report.results
        });
      } else {
        setBroadcastResult({
          success: false,
          message: data.error || "Gagal memproses siaran reminder."
        });
      }
    } catch (err: any) {
      setBroadcastResult({
        success: false,
        message: "Error menghubungi server: " + err.message
      });
    } finally {
      setIsBroadcasting(false);
    }
  };

  const getDirectWhatsAppUrl = (phone: string, text: string) => {
    let clean = phone.replace(/\D/g, "");
    if (clean.startsWith("0")) clean = "62" + clean.slice(1);
    return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="space-y-5 w-full max-w-full overflow-hidden">
      
      {/* 1. Header Hero Banner: Rolling Shift & Otomasi Minggu Malam (1 Kolom Rapi) */}
      <div className="bg-[#121214] border border-[#27272A] p-4 sm:p-5 space-y-4 w-full">
        {/* Top Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 px-2 py-0.5 font-mono">
            SISTEM ROLLING SHIFT MINGGUAN
          </span>
          <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5">
            <RotateCw className="w-3 h-3 text-emerald-400 animate-spin" style={{ animationDuration: "12s" }} />
            Rolling Setiap Senin
          </span>
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
          Jadwal Shift & Pengingat WhatsApp
        </h2>

        {/* Description */}
        <p className="text-sm text-zinc-400 leading-relaxed max-w-3xl">
          Shift kerja karyawan bergulir otomatis setiap hari Senin. Notifikasi reminder WhatsApp otomatis dikirimkan setiap{" "}
          <span className="text-emerald-400 font-bold">Minggu Malam ({shiftSettings.reminderTime || "20:00"} WIB)</span> berisi jadwal shift spesifik masing-masing staf.
        </p>

        {/* Quick Action Buttons: Ditumpuk ke Bawah (Vertical 1 Kolom) */}
        <div className="pt-1 flex flex-col items-start gap-2.5 w-full">
          <button
            onClick={handleBroadcastAll}
            disabled={isBroadcasting}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-900/60 text-black font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            {isBroadcasting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Mengirim Siaran WA...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Kirim Reminder WA Minggu Depan</span>
              </>
            )}
          </button>

          <a
            href="#template-pesan-section"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white font-bold text-xs uppercase font-mono transition-all cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Edit Template Pesan WA</span>
          </a>
        </div>

        {/* Status Bar */}
        <div className="pt-3 border-t border-[#27272A] flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-xs font-mono">
          <div className="flex items-center gap-2 text-zinc-400">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Shift Pagi: <strong className="text-zinc-200">{shiftSettings.pagiStartTime} - {shiftSettings.pagiEndTime} WIB</strong></span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Shift Siang: <strong className="text-zinc-200">{shiftSettings.siangStartTime} - {shiftSettings.siangEndTime} WIB</strong></span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>Kirim Otomatis: <strong className="text-zinc-200">Minggu pk {shiftSettings.reminderTime} WIB</strong></span>
          </div>
        </div>
      </div>

      {/* Sub-navigation: Jadwal Aktif vs Riwayat Shift */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 bg-[#121214] p-1 border border-[#27272A] text-xs font-black uppercase font-mono">
        <button
          onClick={() => setShiftSubTab("aktif")}
          className={`py-2.5 px-3 flex items-center justify-center gap-2 cursor-pointer transition-all ${
            shiftSubTab === "aktif"
              ? "bg-emerald-500 text-black shadow-xs"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Jadwal Aktif & Otomasi WA</span>
        </button>
        <button
          onClick={() => setShiftSubTab("riwayat")}
          className={`py-2.5 px-3 flex items-center justify-center gap-2 cursor-pointer transition-all ${
            shiftSubTab === "riwayat"
              ? "bg-emerald-500 text-black shadow-xs"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <History className="w-4 h-4" />
          <span>Riwayat Shift (Minggu & Bulan Lewat)</span>
        </button>
      </div>

      {shiftSubTab === "riwayat" ? (
        <ShiftHistoryView
          ownerId={ownerId}
          karyawanList={karyawanList}
          shiftSettings={shiftSettings}
          onRefresh={onRefreshKaryawan}
        />
      ) : (
        <>
          {/* Broadcast Result Alert */}
      {broadcastResult && (
        <div className={`p-4 border font-mono text-xs ${
          broadcastResult.success 
            ? "bg-emerald-950/60 border-emerald-700/80 text-emerald-200" 
            : "bg-amber-950/60 border-amber-700/80 text-amber-200"
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 flex-1">
              {broadcastResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-black uppercase tracking-wider text-[12px]">
                    {broadcastResult.success ? "✅ Laporan Siaran WhatsApp Berhasil" : "⚠️ Info Pengiriman WhatsApp"}
                  </p>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-300 font-sans">
                  {broadcastResult.message}
                </p>

                {/* If Gateway is not configured or failed, show guidance & quick navigation button */}
                {!broadcastResult.success && onNavigateToWhatsAppTab && (
                  <div className="pt-2 pb-1">
                    <button
                      type="button"
                      onClick={onNavigateToWhatsAppTab}
                      className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black uppercase px-3 py-1.5 rounded font-mono transition-all cursor-pointer shadow-sm"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Atur Token Fonnte di Tab Pengaturan WhatsApp &rarr;</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setBroadcastResult(null)}
              className="text-zinc-400 hover:text-white p-1 text-xs font-mono"
              title="Tutup pemberitahuan"
            >
              ✕
            </button>
          </div>

          {broadcastResult.results && broadcastResult.results.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                <span>Rincian Pengiriman Per Karyawan ({broadcastResult.results.length} Staf):</span>
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {broadcastResult.results.map((r: any, idx: number) => {
                  const matchingKaryawan = karyawanList.find(k => k.nama === r.nama || k.telepon === r.telepon);
                  return (
                    <div key={idx} className="bg-black/40 border border-zinc-800/80 p-2.5 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-[11px] truncate">{r.nama}</span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded font-mono">
                            {r.shift}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          {r.telepon} {r.reason && !r.sent && <span className="text-amber-400/90 italic">({r.reason})</span>}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${
                          r.sent 
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800" 
                            : "bg-amber-950/80 text-amber-300 border border-amber-800"
                        }`}>
                          {r.sent ? "Terkirim Gateway" : "Belum Terkirim Gateway"}
                        </span>

                        {/* Quick fallback button: WhatsApp Web direct link */}
                        {r.telepon && (
                          <a
                            href={getDirectWhatsAppUrl(r.telepon, r.message)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase rounded transition-all shadow-xs"
                            title="Kirim pesan langsung via WhatsApp Web"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Kirim Manual WA</span>
                          </a>
                        )}

                        {matchingKaryawan && (
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(matchingKaryawan, "next")}
                            className="p-1 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-mono rounded"
                            title="Edit / Preview Pesan"
                          >
                            Edit/Preview
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Comparison Cards: Minggu Ini & Minggu Depan (1 Kolom Penuh) */}
      <div className="flex flex-col gap-5 w-full min-w-0">
        {/* Minggu Ini Card */}
        <div className="bg-[#121214] border border-[#27272A] p-4 sm:p-5 space-y-4 min-w-0 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#27272A] pb-3 gap-2">
            <div>
              <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider font-mono block">
                JADWAL AKTIF BERJALAN
              </span>
              <h3 className="text-base font-black uppercase text-white tracking-wide flex items-center gap-2 mt-0.5">
                <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
                Minggu Ini
              </h3>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-zinc-300 bg-zinc-900 border border-zinc-700 px-3 py-1.5 self-start sm:self-auto">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>{getCompactRange(currentMonday)}</span>
            </div>
          </div>

          <div className="space-y-2.5 min-w-0">
            {karyawanList.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">Belum ada staf terdaftar.</p>
            ) : (
              karyawanList.map(k => {
                const shiftInfo = calculateEmployeeShift(k, currentMonday, shiftSettings);
                const isTidakAda = shiftInfo.shift === "tidak_ada";
                const isPagi = shiftInfo.shift === "pagi";
                return (
                  <div key={k.id} className="p-3 bg-zinc-950 border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-white uppercase tracking-tight">{k.nama}</h4>
                        <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-1.5 py-0.5">
                          @{k.username}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono flex items-center gap-1.5 mt-1">
                        <Phone className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span>{k.telepon || "No WA belum diisi"}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                      <div className={`px-3 py-1.5 border font-mono flex items-center gap-2.5 ${
                        isTidakAda
                          ? "bg-zinc-900/90 text-zinc-300 border-zinc-700"
                          : isPagi 
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/80" 
                            : "bg-amber-950/60 text-amber-300 border-amber-800/80"
                      }`}>
                        {isTidakAda ? (
                          <Coffee className="w-4 h-4 text-zinc-400 shrink-0" />
                        ) : isPagi ? (
                          <Sun className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Sunset className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <div>
                          <span className="text-[11px] font-black uppercase block tracking-wider leading-tight">
                            {shiftInfo.shiftName}
                          </span>
                          <span className="text-[10px] opacity-80 block font-normal mt-0.5">
                            {shiftInfo.jamKerja}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Minggu Depan Card (Hasil Rolling) */}
        <div className="bg-[#121214] border border-[#27272A] p-4 sm:p-5 space-y-4 min-w-0 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#27272A] pb-3 gap-2">
            <div>
              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider font-mono block">
                HASIL ROLLING OTOMATIS
              </span>
              <h3 className="text-base font-black uppercase text-white tracking-wide flex items-center gap-2 mt-0.5">
                <RotateCw className="w-4 h-4 text-emerald-400 shrink-0" />
                Minggu Depan (Mulai Senin)
              </h3>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-800/90 px-3 py-1.5 self-start sm:self-auto">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{getCompactRange(nextMonday)}</span>
            </div>
          </div>

          <div className="space-y-2.5 min-w-0">
            {karyawanList.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">Belum ada staf terdaftar.</p>
            ) : (
              karyawanList.map(k => {
                const shiftInfo = calculateEmployeeShift(k, nextMonday, shiftSettings);
                const isTidakAda = shiftInfo.shift === "tidak_ada";
                const isPagi = shiftInfo.shift === "pagi";
                return (
                  <div key={k.id} className="p-3 bg-zinc-950 border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-white uppercase tracking-tight">{k.nama}</h4>
                        <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-1.5 py-0.5">
                          @{k.username}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono flex items-center gap-1.5 mt-1">
                        <Phone className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span>{k.telepon || "No WA belum diisi"}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                      <div className={`px-3 py-1.5 border font-mono flex items-center gap-2.5 ${
                        isTidakAda
                          ? "bg-zinc-900/90 text-zinc-300 border-zinc-700"
                          : isPagi 
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/80" 
                            : "bg-amber-950/60 text-amber-300 border-amber-800/80"
                      }`}>
                        {isTidakAda ? (
                          <Coffee className="w-4 h-4 text-zinc-400 shrink-0" />
                        ) : isPagi ? (
                          <Sun className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Sunset className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <div>
                          <span className="text-[11px] font-black uppercase block tracking-wider leading-tight">
                            {shiftInfo.shiftName}
                          </span>
                          <span className="text-[10px] opacity-80 block font-normal mt-0.5">
                            {shiftInfo.jamKerja}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 3. Detail Management & WhatsApp Actions per Employee */}
      <div className="bg-[#121214] border border-[#27272A] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#27272A] gap-2">
          <div>
            <h3 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Daftar Staf & Pengaturan Nomor WhatsApp
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Kelola nomor WhatsApp, tukar shift dasar, atau kirim pengingat pesan personal ke staf.
            </p>
          </div>
        </div>

        <div className="space-y-3.5">
          {karyawanList.map(k => {
            const thisWeekShift = calculateEmployeeShift(k, currentMonday, shiftSettings);
            const nextWeekShift = calculateEmployeeShift(k, nextMonday, shiftSettings);
            const isEditingThisPhone = editingPhoneId === k.id;

            return (
              <div key={k.id} className="bg-zinc-950 border border-[#27272A] p-4 space-y-3.5 w-full min-w-0">
                {/* Top Section: Staf Info & Phone Number */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-900 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                    <h4 className="text-base font-black text-white uppercase tracking-tight">{k.nama}</h4>
                    <span className="text-[11px] text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5">
                      @{k.username}
                    </span>
                    {k.autoRollingShift !== false ? (
                      <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-950/50 border border-emerald-900/50 px-2 py-0.5 font-mono">
                        Auto-Rolling
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 font-mono">
                        Shift Tetap
                      </span>
                    )}
                  </div>

                  {/* Phone Row */}
                  <div className="flex items-center gap-2 text-xs font-mono min-w-0 flex-wrap">
                    <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    {isEditingThisPhone ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <input
                          type="text"
                          value={phoneInputVal}
                          onChange={(e) => setPhoneInputVal(e.target.value)}
                          placeholder="Contoh: 08123456789"
                          className="bg-[#18181B] border border-[#27272A] px-2.5 py-1.5 text-xs text-white font-mono focus:border-emerald-500 outline-none w-44"
                        />
                        <button
                          onClick={() => handleSavePhone(k.id)}
                          disabled={savingPhone}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase cursor-pointer"
                        >
                          Simpan
                        </button>
                        <button
                          onClick={() => setEditingPhoneId(null)}
                          className="px-2.5 py-1.5 bg-zinc-800 text-zinc-400 hover:text-white text-[10px] uppercase cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={k.telepon ? "text-zinc-200 font-bold" : "text-amber-400 italic"}>
                          {k.telepon || "Belum ada nomor WhatsApp"}
                        </span>
                        <button
                          onClick={() => {
                            setEditingPhoneId(k.id);
                            setPhoneInputVal(k.telepon || "");
                          }}
                          className="text-[10px] font-bold text-emerald-400 hover:underline cursor-pointer bg-emerald-950/40 border border-emerald-900/50 px-2 py-0.5"
                        >
                          Edit No HP
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Middle Section: Shift Badges Comparison (1 Kolom Penuh ke Bawah) */}
                <div className="flex flex-col gap-2.5 w-full min-w-0">
                  {/* Box 1: Minggu Ini */}
                  <div className="p-3 bg-zinc-900/90 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {thisWeekShift.shift === "tidak_ada" ? (
                        <Coffee className="w-4 h-4 text-zinc-400 shrink-0" />
                      ) : thisWeekShift.shift === "pagi" ? (
                        <Sun className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Sunset className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <div>
                        <span className="text-[9px] font-black uppercase text-zinc-500 block font-mono">
                          Minggu Ini (Aktif)
                        </span>
                        <span className={`text-xs font-black uppercase font-mono block mt-0.5 ${
                          thisWeekShift.shift === "tidak_ada" ? "text-zinc-400" : thisWeekShift.shift === "pagi" ? "text-emerald-400" : "text-amber-400"
                        }`}>
                          {thisWeekShift.shiftName}
                        </span>
                      </div>
                    </div>
                    <div className="self-start sm:self-auto">
                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-200 font-mono bg-zinc-950 px-3 py-1.5 border border-zinc-700">
                        <Clock className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span>{thisWeekShift.jamKerja}</span>
                      </span>
                    </div>
                  </div>

                  {/* Box 2: Minggu Depan */}
                  <div className="p-3 bg-emerald-950/20 border border-emerald-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {nextWeekShift.shift === "tidak_ada" ? (
                        <Coffee className="w-4 h-4 text-zinc-400 shrink-0" />
                      ) : nextWeekShift.shift === "pagi" ? (
                        <Sun className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Sunset className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <div>
                        <span className="text-[9px] font-black uppercase text-emerald-400 block font-mono">
                          Minggu Depan (Rolling)
                        </span>
                        <span className={`text-xs font-black uppercase font-mono block mt-0.5 ${
                          nextWeekShift.shift === "tidak_ada" ? "text-zinc-400" : nextWeekShift.shift === "pagi" ? "text-emerald-400" : "text-amber-400"
                        }`}>
                          {nextWeekShift.shiftName}
                        </span>
                      </div>
                    </div>
                    <div className="self-start sm:self-auto">
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 font-mono bg-emerald-950/80 px-3 py-1.5 border border-emerald-800/80">
                        <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{nextWeekShift.jamKerja}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Section: Quick Action Buttons (Ditempatkan di Bawah Tanpa Menumpuk) */}
                <div className="pt-2.5 border-t border-zinc-900 grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                  <button
                    onClick={() => handleOpenEditShiftModal(k)}
                    title="Atur shift staf (Shift Pagi, Shift Siang, atau Tidak Ada Shift / Libur)"
                    className="w-full px-2.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-emerald-500/50 text-emerald-400 hover:text-emerald-300 font-black text-[11px] uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Atur Shift</span>
                  </button>

                  <button
                    onClick={() => handleToggleBaseShift(k)}
                    title="Ubah shift dasar staf ini (Pagi <-> Siang)"
                    className="w-full px-2.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white font-black text-[11px] uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>Tukar Shift</span>
                  </button>

                  <button
                    onClick={() => handleOpenPreview(k, "next")}
                    title="Lihat pesan WhatsApp yang akan dikirim ke staf ini"
                    className="w-full px-2.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white font-black text-[11px] uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Preview WA</span>
                  </button>

                  <button
                    onClick={() => handleSendSingleReminder(k)}
                    disabled={sendingSingleId === k.id || !k.telepon}
                    title="Kirim reminder WhatsApp sekarang juga ke staf ini via Gateway"
                    className="w-full px-2.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-black text-[11px] uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {sendingSingleId === k.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <Send className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>Kirim WA</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Configuration Form for Shift Hours & Reminder Settings */}
      <div className="bg-[#121214] border border-[#27272A] p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#27272A]">
          <div>
            <h3 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-400" />
              Pengaturan Jam Kerja Shift & Waktu Kirim Otomatis
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Sesuaikan jam masuk/pulang shift pagi dan shift siang, serta jadwal pengiriman otomatis di hari Minggu malam.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveShiftSettings} className="space-y-4">
          <div className="flex flex-col gap-4">
            
            {/* Shift Pagi Hours (1 Kolom Penuh) */}
            <div className="p-4 sm:p-5 bg-zinc-950 border border-zinc-800 space-y-3.5 w-full">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-2.5">
                <Sun className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-black uppercase text-white tracking-wider">Jam Shift Pagi</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1.5 font-mono">
                    Jam Mulai (Masuk)
                  </label>
                  <input
                    type="time"
                    value={shiftSettings.pagiStartTime}
                    onChange={(e) => setShiftSettings(prev => ({ ...prev, pagiStartTime: e.target.value }))}
                    className="w-full bg-[#18181B] border border-[#27272A] px-3.5 py-2.5 text-sm text-white font-mono focus:border-emerald-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1.5 font-mono">
                    Jam Selesai (Pulang)
                  </label>
                  <input
                    type="time"
                    value={shiftSettings.pagiEndTime}
                    onChange={(e) => setShiftSettings(prev => ({ ...prev, pagiEndTime: e.target.value }))}
                    className="w-full bg-[#18181B] border border-[#27272A] px-3.5 py-2.5 text-sm text-white font-mono focus:border-emerald-500 outline-none"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Shift Siang Hours (1 Kolom Penuh) */}
            <div className="p-4 sm:p-5 bg-zinc-950 border border-zinc-800 space-y-3.5 w-full">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-2.5">
                <Sunset className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-black uppercase text-white tracking-wider">Jam Shift Siang</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1.5 font-mono">
                    Jam Mulai (Masuk)
                  </label>
                  <input
                    type="time"
                    value={shiftSettings.siangStartTime}
                    onChange={(e) => setShiftSettings(prev => ({ ...prev, siangStartTime: e.target.value }))}
                    className="w-full bg-[#18181B] border border-[#27272A] px-3.5 py-2.5 text-sm text-white font-mono focus:border-emerald-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1.5 font-mono">
                    Jam Selesai (Pulang)
                  </label>
                  <input
                    type="time"
                    value={shiftSettings.siangEndTime}
                    onChange={(e) => setShiftSettings(prev => ({ ...prev, siangEndTime: e.target.value }))}
                    className="w-full bg-[#18181B] border border-[#27272A] px-3.5 py-2.5 text-sm text-white font-mono focus:border-emerald-500 outline-none"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. WhatsApp Reminder Message Template Editor */}
          <div id="template-pesan-section" className="p-4 sm:p-5 bg-zinc-950 border border-zinc-800 space-y-4 w-full scroll-mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800 pb-3 gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-sm font-black uppercase text-white tracking-wider">
                    Format & Isi Pesan Pengingat WhatsApp
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Kustomisasi isi pesan reminder shift yang dikirimkan otomatis ke WhatsApp staf setiap Minggu malam.
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 self-start sm:self-auto">
                Dukungan Variabel Otomatis
              </span>
            </div>

            {/* Variable Tokens Helper */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-zinc-400 font-mono flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Klik Variabel untuk Menyisipkan ke Pesan:</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                {[
                  { tag: "{nama}", label: "Nama Staf" },
                  { tag: "{periode}", label: "Periode Tanggal" },
                  { tag: "{shift}", label: "Shift & Emoji" },
                  { tag: "{nama_shift}", label: "Nama Shift Saja" },
                  { tag: "{jam_kerja}", label: "Jam Kerja Lengkap" },
                  { tag: "{jam_mulai}", label: "Jam Masuk" },
                  { tag: "{jam_selesai}", label: "Jam Pulang" },
                  { tag: "{catatan_khusus}", label: "Tips & Ketentuan" },
                  { tag: "{nama_laundry}", label: "Nama Outlet" },
                ].map(({ tag, label }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleInsertVariable(tag)}
                    title={`Sisipkan variabel ${tag} (${label})`}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-emerald-950/80 hover:text-emerald-300 hover:border-emerald-700 border border-zinc-700/80 text-zinc-300 transition-all text-left flex items-center gap-1 cursor-pointer"
                  >
                    <span className="text-emerald-400 font-bold">{tag}</span>
                    <span className="text-zinc-400 text-[10px]">({label})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea for Template */}
            <div className="space-y-2">
              <textarea
                ref={templateTextareaRef}
                value={shiftSettings.reminderMessageTemplate ?? DEFAULT_SHIFT_REMINDER_TEMPLATE}
                onChange={(e) => setShiftSettings(prev => ({ ...prev, reminderMessageTemplate: e.target.value }))}
                rows={10}
                placeholder="Tuliskan format isi pesan WhatsApp di sini..."
                className="w-full bg-[#18181B] border border-[#27272A] p-3.5 text-xs sm:text-sm text-zinc-100 font-mono focus:border-emerald-500 outline-none leading-relaxed resize-y"
              />

              {/* Template Controls Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-xs">
                <button
                  type="button"
                  onClick={handleResetTemplateToDefault}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 cursor-pointer text-[11px]"
                >
                  <RotateCcw className="w-3 h-3 text-zinc-400" />
                  <span>Kembalikan Format Standar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTemplateLivePreview(prev => !prev)}
                  className={`px-3 py-1.5 border flex items-center gap-1.5 cursor-pointer text-[11px] font-bold ${
                    showTemplateLivePreview 
                      ? "bg-emerald-950/80 border-emerald-600 text-emerald-300" 
                      : "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300"
                  }`}
                >
                  <Eye className="w-3 h-3 text-emerald-400" />
                  <span>{showTemplateLivePreview ? "Sembunyikan Simulasi Preview" : "Tinjau Simulasi Hasil Pesan"}</span>
                </button>
              </div>
            </div>

            {/* Live Template Preview Box */}
            {showTemplateLivePreview && (
              <div className="p-3.5 bg-zinc-900/90 border border-emerald-900/60 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 border-b border-zinc-800 pb-1.5">
                  <span className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Simulasi Tampilan di WhatsApp Staf (Minggu Depan):
                  </span>
                  <span className="text-zinc-400">
                    Contoh: {karyawanList.length > 0 ? karyawanList[0].nama : "Budi Santoso"}
                  </span>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-300 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                  {buildShiftReminderWhatsAppMessage(
                    karyawanList.length > 0 ? karyawanList[0] : { id: "sample", nama: "Budi Santoso", currentShift: "pagi" } as any,
                    nextMonday,
                    shiftSettings
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sunday Reminder Schedule */}
          <div className="p-4 bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-black uppercase text-white tracking-wider">Jadwal Kirim Otomatis Minggu Malam</h4>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shiftSettings.isAutoReminderEnabled !== false}
                  onChange={(e) => setShiftSettings(prev => ({ ...prev, isAutoReminderEnabled: e.target.checked }))}
                  className="rounded-none border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                />
                <span className="text-[11px] font-bold text-zinc-300 font-mono">Aktifkan Otomasi</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1 font-mono">
                  Waktu Pengiriman (WIB)
                </label>
                <input
                  type="time"
                  value={shiftSettings.reminderTime || "20:00"}
                  onChange={(e) => setShiftSettings(prev => ({ ...prev, reminderTime: e.target.value }))}
                  className="w-full bg-[#18181B] border border-[#27272A] px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 outline-none"
                  required
                />
                <p className="text-[10px] text-zinc-500 font-mono mt-1">
                  Rekomendasi: 20:00 WIB (Minggu malam) agar staf sempat mempersiapkan waktu tidur.
                </p>
              </div>

              <div className="space-y-1 bg-zinc-900/50 p-3 border border-zinc-800 text-[11px] font-mono text-zinc-400">
                <p className="text-zinc-200 font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  Status Gateway WhatsApp:
                </p>
                <p>
                  {waGatewayConfig?.isEnabled ? (
                    <span className="text-emerald-400 font-bold">✓ Gateway WhatsApp Aktif ({waGatewayConfig.gateway.toUpperCase()})</span>
                  ) : (
                    <span className="text-amber-400 font-bold">⚠ Gateway WhatsApp Belum Dikonfigurasi di Tab Pengingat Tagihan</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-950 text-black font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              {savingSettings ? "Menyimpan..." : "Simpan Pengaturan Shift & Format Pesan"}
            </button>
          </div>
        </form>
      </div>
      </>
      )}

      {/* 5. Modal: WhatsApp Preview & Test Send (Dapat Diedit Langsung) */}
      {selectedStaffForPreview && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-[#27272A] max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <div>
                <span className="text-[9px] font-black uppercase text-emerald-500 tracking-wider font-mono">
                  PREVIEW & EDIT PESAN WHATSAPP
                </span>
                <h3 className="text-base font-black uppercase text-white tracking-tight">
                  Pengingat Shift: {selectedStaffForPreview.nama}
                </h3>
              </div>
              <button
                onClick={() => setSelectedStaffForPreview(null)}
                className="text-zinc-400 hover:text-white font-mono text-xs p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>Tujuan: <strong>{selectedStaffForPreview.telepon || "Belum ada no WA"}</strong></span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleOpenPreview(selectedStaffForPreview, "next")}
                    className={`px-2 py-0.5 text-[10px] uppercase font-bold cursor-pointer ${
                      previewWeekTarget === "next" ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    Minggu Depan
                  </button>
                  <button
                    onClick={() => handleOpenPreview(selectedStaffForPreview, "current")}
                    className={`px-2 py-0.5 text-[10px] uppercase font-bold cursor-pointer ${
                      previewWeekTarget === "current" ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    Minggu Ini
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <label className="flex items-center gap-1.5 text-zinc-300">
                  <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Isi Pesan (Dapat Anda edit langsung sebelum dikirim):</span>
                </label>
              </div>

              {/* Editable Message Box */}
              <textarea
                value={customMsgPreview}
                onChange={(e) => setCustomMsgPreview(e.target.value)}
                rows={9}
                className="w-full p-3 bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-300/90 whitespace-pre-wrap leading-relaxed outline-none focus:border-emerald-500 resize-y"
              />

              {/* Action Toolbar for Preview Message */}
              <div className="flex items-center justify-between gap-2 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const targetMondayDate = previewWeekTarget === "next" ? nextMonday : currentMonday;
                    const msg = buildShiftReminderWhatsAppMessage(selectedStaffForPreview, targetMondayDate, shiftSettings);
                    setCustomMsgPreview(msg);
                  }}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-zinc-400" />
                  <span>Reset ke Template</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyMessage(customMsgPreview)}
                  className={`px-3 py-1 border text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    copiedMsg
                      ? "bg-emerald-950 text-emerald-300 border-emerald-600"
                      : "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white"
                  }`}
                >
                  {copiedMsg ? (
                    <>
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Salin Pesan</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#27272A]">
              {selectedStaffForPreview.telepon && (
                <a
                  href={getDirectWhatsAppUrl(selectedStaffForPreview.telepon, customMsgPreview)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white font-bold text-xs uppercase flex items-center gap-1.5 cursor-pointer font-mono"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Web WhatsApp</span>
                </a>
              )}

              <button
                onClick={() => {
                  handleSendSingleReminder(selectedStaffForPreview, customMsgPreview);
                  setSelectedStaffForPreview(null);
                }}
                disabled={!selectedStaffForPreview.telepon}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-black text-xs uppercase flex items-center gap-1.5 cursor-pointer font-mono"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim via Gateway</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Shift Modal (Pagi, Siang, or Tidak Ada Shift) */}
      {editingShiftStaff && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#121214] border border-[#27272A] w-full max-w-lg p-5 space-y-4 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#27272A]">
              <div>
                <span className="text-[10px] font-mono uppercase text-emerald-400 tracking-wider block font-black">
                  PENGATURAN SHIFT STAF
                </span>
                <h3 className="text-base font-black uppercase text-white tracking-wide mt-0.5 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>{editingShiftStaff.nama}</span>
                </h3>
              </div>
              <button
                onClick={() => setEditingShiftStaff(null)}
                className="text-zinc-500 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3 Shift Options */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-zinc-300 block font-mono">
                Pilih Status / Jadwal Shift:
              </label>
              
              <div className="grid grid-cols-1 gap-2.5">
                {/* Option 1: Shift Pagi */}
                <button
                  type="button"
                  onClick={() => setSelectedNewShift("pagi")}
                  className={`p-3 border text-left cursor-pointer transition-all flex items-center justify-between ${
                    selectedNewShift === "pagi"
                      ? "bg-emerald-950/80 text-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30"
                      : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 border ${selectedNewShift === "pagi" ? "bg-emerald-900/80 border-emerald-700 text-emerald-300" : "bg-zinc-900 border-zinc-800 text-zinc-500"}`}>
                      <Sun className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-black uppercase block tracking-wide text-white">Shift Pagi</span>
                      <span className="text-[11px] opacity-80 block font-mono mt-0.5">
                        {shiftSettings.pagiStartTime} - {shiftSettings.pagiEndTime} WIB
                      </span>
                    </div>
                  </div>
                  {selectedNewShift === "pagi" && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mr-1" />
                  )}
                </button>

                {/* Option 2: Shift Siang */}
                <button
                  type="button"
                  onClick={() => setSelectedNewShift("siang")}
                  className={`p-3 border text-left cursor-pointer transition-all flex items-center justify-between ${
                    selectedNewShift === "siang"
                      ? "bg-amber-950/80 text-amber-300 border-amber-500 shadow-sm ring-1 ring-amber-500/30"
                      : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 border ${selectedNewShift === "siang" ? "bg-amber-900/80 border-amber-700 text-amber-300" : "bg-zinc-900 border-zinc-800 text-zinc-500"}`}>
                      <Sunset className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-black uppercase block tracking-wide text-white">Shift Siang</span>
                      <span className="text-[11px] opacity-80 block font-mono mt-0.5">
                        {shiftSettings.siangStartTime} - {shiftSettings.siangEndTime} WIB
                      </span>
                    </div>
                  </div>
                  {selectedNewShift === "siang" && (
                    <Check className="w-4 h-4 text-amber-400 shrink-0 mr-1" />
                  )}
                </button>

                {/* Option 3: Tidak Ada Shift */}
                <button
                  type="button"
                  onClick={() => setSelectedNewShift("tidak_ada")}
                  className={`p-3 border text-left cursor-pointer transition-all flex items-center justify-between ${
                    selectedNewShift === "tidak_ada"
                      ? "bg-zinc-900 text-white border-zinc-500 shadow-sm ring-1 ring-zinc-500/40"
                      : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 border ${selectedNewShift === "tidak_ada" ? "bg-zinc-800 border-zinc-600 text-zinc-200" : "bg-zinc-900 border-zinc-800 text-zinc-500"}`}>
                      <Coffee className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase block tracking-wide text-white">
                          Tidak Ada Shift (Libur / Bebas Tugas)
                        </span>
                        <span className="text-[9px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 font-mono uppercase font-bold">
                          Non-Shift
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400 block font-mono mt-0.5">
                        Karyawan tidak memiliki jadwal tugas / libur dari sistem shift
                      </span>
                    </div>
                  </div>
                  {selectedNewShift === "tidak_ada" && (
                    <Check className="w-4 h-4 text-white shrink-0 mr-1" />
                  )}
                </button>
              </div>
            </div>

            {/* Auto Rolling Checkbox (Only if Pagi or Siang) */}
            <div className="p-3 bg-zinc-950 border border-zinc-800 font-mono">
              {selectedNewShift === "tidak_ada" ? (
                <p className="text-xs text-zinc-400 flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>Auto-rolling dinonaktifkan otomatis saat karyawan berstatus Tidak Ada Shift (Libur).</span>
                </p>
              ) : (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAutoRolling}
                    onChange={(e) => setSelectedAutoRolling(e.target.checked)}
                    className="rounded-none border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-zinc-200 block">
                      Aktifkan Rolling Shift Otomatis
                    </span>
                    <span className="text-[10px] text-zinc-400 block mt-0.5">
                      Berganti Pagi ↔ Siang secara otomatis setiap hari Senin.
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#27272A]">
              <button
                type="button"
                onClick={() => setEditingShiftStaff(null)}
                className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white font-bold text-xs uppercase cursor-pointer font-mono"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEmployeeShift}
                disabled={savingEmployeeShift}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-black text-xs uppercase flex items-center gap-1.5 cursor-pointer font-mono"
              >
                {savingEmployeeShift ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
