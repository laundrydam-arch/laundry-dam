import React, { useState, useMemo, useEffect } from "react";
import { 
  Bell, 
  Plus, 
  Trash2, 
  Edit, 
  CheckCircle, 
  Calendar, 
  Info, 
  Tag, 
  AlertTriangle, 
  Clock, 
  Filter, 
  Search, 
  FileText,
  Smartphone,
  Share2,
  MessageSquare,
  Send,
  Settings,
  Check,
  Loader2,
  RotateCw,
  Sun,
  Sunset
} from "lucide-react";
import { Reminder, Karyawan } from "../types";
import { showSystemNotification } from "../utils/notifications";
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, onSnapshot } from "firebase/firestore";
import { ShiftManagementTab } from "./ShiftManagementTab";

interface BillRemindersProps {
  reminders: Reminder[];
  onAddReminder: (newRem: Reminder) => void;
  onUpdateReminder: (updatedRem: Reminder) => void;
  onDeleteReminder: (id: string) => void;
  onAddExpense: (expense: any) => void;
  onSetSubTab: (tab: string) => void;
  theme?: string;
  ownerId?: string | null;
  karyawanList?: Karyawan[];
}

const formatTanggal = (dateStr?: any): string => {
  if (!dateStr) return "";
  const str = String(dateStr).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (match) {
    const [_, year, month, day, rest] = match;
    return `${day}-${month}-${year}`;
  }
  return str;
};

const formatIDR = (val: any): string => {
  const num = typeof val === "number" ? val : Number(val) || 0;
  return "Rp " + num.toLocaleString("id-ID");
};

export function BillReminders({
  reminders,
  onAddReminder,
  onUpdateReminder,
  onDeleteReminder,
  onAddExpense,
  onSetSubTab,
  theme = "dark",
  ownerId = null,
  karyawanList = []
}: BillRemindersProps) {
  // Standardize and sanitize reminders to be fully crash-proof
  const safeReminders = useMemo(() => {
    return (Array.isArray(reminders) ? reminders : []).filter(r => r && typeof r === "object");
  }, [reminders]);

  // UI main navigation tab
  const [activeTab, setActiveTab] = useState<"list" | "whatsapp" | "shift">("list");
  
  // Local karyawan list fallback from Firestore if not provided
  const [internalKaryawan, setInternalKaryawan] = useState<Karyawan[]>(karyawanList);

  useEffect(() => {
    if (karyawanList && karyawanList.length > 0) {
      setInternalKaryawan(karyawanList);
      return;
    }
    if (!ownerId || ownerId === "guest") return;
    const unsub = onSnapshot(collection(db, "users", ownerId, "karyawan"), (snap) => {
      const list: Karyawan[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Karyawan);
      });
      setInternalKaryawan(list);
    });
    return unsub;
  }, [ownerId, karyawanList]);

  // UI Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNotificationGuide, setShowNotificationGuide] = useState(false);

  // Form Fields
  const [title, setTitle] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  });
  const [dueTime, setDueTime] = useState("12:00");
  const [category, setCategory] = useState("Lain-lain");
  const [notes, setNotes] = useState("");
  const [isPaidForm, setIsPaidForm] = useState(false);
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [repeatWeeklyThursday, setRepeatWeeklyThursday] = useState(false);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"semua" | "belum" | "lunas" | "terlambat">("semua");

  // WhatsApp Config States
  const [ownerWaNumber, setOwnerWaNumber] = useState("");
  const [ownerWaNumber2, setOwnerWaNumber2] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [fonnteToken, setFonnteToken] = useState("");
  const [gateway, setGateway] = useState<"fonnte" | "generic" | "manual">("manual");
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isTriggeringCheck, setIsTriggeringCheck] = useState(false);

  const getCronUrl = (): string => {
    const origin = window.location.origin;
    // Otomatis ganti domain sandbox privat 'ais-dev-' menjadi domain pratinjau publik 'ais-pre-'
    // agar cron-job.org bisa menembus API tanpa terhalang autentikasi developer
    if (origin.includes("ais-dev-")) {
      return origin.replace("ais-dev-", "ais-pre-") + "/api/whatsapp/cron-trigger";
    }
    return origin + "/api/whatsapp/cron-trigger";
  };

  // Native notification permission state
  const [notificationPermission, setNotificationPermission] = useState<string>(() => {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        return Notification.permission;
      }
    } catch (e) {
      console.warn("Notification API is restricted or not accessible in this context:", e);
    }
    return "unsupported";
  });

  // Load WhatsApp Config from Firestore
  useEffect(() => {
    if (!ownerId || ownerId === "guest") return;
    const loadSettings = async () => {
      try {
        const settingsRef = doc(db, "users", ownerId, "settings", "whatsapp");
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          const data = snap.data();
          setOwnerWaNumber(data.ownerWaNumber || "");
          setOwnerWaNumber2(data.ownerWaNumber2 || "");
          setIsEnabled(!!data.isEnabled);
          setFonnteToken(data.fonnteToken || "");
          setGateway(data.gateway || "fonnte");
        }
      } catch (err) {
        console.error("Gagal memuat pengaturan WhatsApp dari Firestore:", err);
      }
    };
    loadSettings();
  }, [ownerId]);

  // Request native browser permission
  const requestNotificationPermission = async () => {
    try {
      if (typeof window === "undefined" || !("Notification" in window)) {
        alert("Browser di HP Anda belum mendukung Web Notifications API secara langsung. Silakan buka aplikasi ini di aplikasi Google Chrome (Android) atau Safari (iOS) di HP.");
        return;
      }

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        alert("IZIN DIAGKTIFKAN! DAMDAM Laundry sekarang bisa mengirimkan notifikasi jatuh tempo gajihan & sewa ruko langsung ke status bar HP Anda.");
        showSystemNotification("DAMDAM Laundry Notifikasi", {
          body: "Yess! Sistem Notifikasi HP berhasil terhubung. Anda akan diperingatkan setiap kali ada tagihan penting jatuh tempo.",
          requireInteraction: true
        });
      } else if (permission === "denied") {
        alert("Izin Notifikasi ditolak browser HP. Tolong buka pengaturan site di browser Chrome/Safari HP Anda, lalu berikan izin notifikasi manual.");
      }
    } catch (e) {
      console.error("Gagal meminta izin notifikasi:", e);
      alert("Gagal mengaktifkan notifikasi: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Test native trigger
  const triggerTestNotification = () => {
    if (notificationPermission !== "granted") {
      alert("Izin notifikasi HP belum aktif! Pastikan anda mengetuk tombol 'Sambungkan Notifikasi HP' terlebih dahulu.");
      return;
    }
    try {
      showSystemNotification("📢 PENGINGAT SEWA RUKO (UJI COBA)", {
        body: "CONTOH: Tagihan bulanan sewa ruko utama senilai Rp 2.500.000 jatuh tempo besok! Harap diselesaikan.",
        requireInteraction: true
      });
      if (navigator.vibrate) {
        navigator.vibrate([150, 50, 150]);
      }
    } catch (err) {
      alert("Gagal memicu notifikasi native: " + err);
    }
  };

  // Format amount parsing helpers
  const handleAmountStrChange = (val: string) => {
    const clean = val.replace(/\D/g, "");
    setAmountStr(clean ? Number(clean).toLocaleString("id-ID") : "");
  };

  const getAmountNumber = (val: string): number => {
    const clean = val.replace(/\D/g, "");
    return clean ? parseInt(clean, 10) : 0;
  };

  const todayStr = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    let totalUnpaid = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;

    safeReminders.forEach(r => {
      if (!r) return;
      if (!r.isPaid) {
        const amount = typeof r.amount === "number" ? r.amount : Number(r.amount) || 0;
        totalUnpaid += amount;
        const dueDate = r.dueDate || "";
        if (dueDate < todayStr) {
          overdueCount++;
        } else if (dueDate === todayStr) {
          dueSoonCount++;
        }
      }
    });

    return { totalUnpaid, overdueCount, dueSoonCount };
  }, [safeReminders, todayStr]);

  // Handle Form Submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) {
      alert("Harap isi deskripsi tagihan dan tanggal jatuh tempo!");
      return;
    }

    const price = getAmountNumber(amountStr);
    if (price <= 0) {
      alert("Harap masukkan biaya tagihan yang valid (minimal lebih dari Rp 0)!");
      return;
    }

    if (editingId) {
      // Find old item to keep userId, createdAt, and isPaid status
      const oldRem = safeReminders.find(item => item.id === editingId);
      if (oldRem) {
        // Jika detail waktu, tanggal, atau nilai tagihan diedit, reset penanda terkirim WA agar bisa diuji coba kembali langsung
        const isTimeOrDateChanged = oldRem.dueDate !== dueDate || oldRem.dueTime !== dueTime || oldRem.amount !== price || oldRem.title !== title.trim();
        const updated: Reminder = {
          ...oldRem,
          title: title.trim(),
          amount: price,
          dueDate,
          dueTime,
          category,
          notes: notes.trim(),
          isPaid: isPaidForm,
          repeatMonthly: repeatMonthly,
          repeatWeeklyThursday: repeatWeeklyThursday,
          ...(isTimeOrDateChanged ? {
            waNotificationSent: false,
            lastNotificationSentDate: ""
          } : {})
        };
        onUpdateReminder(updated);
        alert("Berhasil memperbarui pengingat!");
      }
      setEditingId(null);
    } else {
      const fresh: Reminder = {
        id: "rem-" + Date.now(),
        title: title.trim(),
        amount: price,
        dueDate,
        dueTime,
        isPaid: isPaidForm,
        category,
        notes: notes.trim(),
        userId: ownerId || "guest",
        createdAt: new Date().toISOString(),
        repeatMonthly: repeatMonthly,
        repeatWeeklyThursday: repeatWeeklyThursday
      };
      onAddReminder(fresh);
      alert("Berhasil menambahkan pengingat!");
    }

    // Reset Form
    resetForm();
  };

  const resetForm = () => {
    setTitle("");
    setAmountStr("");
    setCategory("Lain-lain");
    setNotes("");
    setDueTime("12:00");
    setIsPaidForm(false);
    setRepeatMonthly(false);
    setRepeatWeeklyThursday(false);
    setShowAddForm(false);
    setEditingId(null);
  };

  // Trigger editing state
  const handleStartEdit = (rem: Reminder) => {
    setEditingId(rem.id);
    setTitle(rem.title || "");
    const amtVal = rem.amount !== undefined && rem.amount !== null ? rem.amount : 0;
    const numAmt = typeof amtVal === "number" ? amtVal : Number(amtVal) || 0;
    setAmountStr(numAmt.toLocaleString("id-ID"));
    setDueDate(rem.dueDate || "");
    setDueTime(rem.dueTime || "12:00");
    setCategory(rem.category);
    setNotes(rem.notes || "");
    setIsPaidForm(!!rem.isPaid);
    setRepeatMonthly(!!rem.repeatMonthly);
    setRepeatWeeklyThursday(!!rem.repeatWeeklyThursday);
    setShowAddForm(true);
  };

  // Direct Status Change (Ubah status secara langsung TANPA memasukkan ke Catatan Pengeluaran)
  const handleDirectStatusChange = (rem: Reminder, newIsPaid: boolean) => {
    onUpdateReminder({
      ...rem,
      isPaid: newIsPaid
    });
    if (newIsPaid) {
      alert(`Status tagihan "${rem.title}" berhasil diubah menjadi SUDAH DIBAYAR.\n\n(Catatan: Status diubah manual tanpa mencatat transaksi baru ke Catatan Pengeluaran. Jika Anda ingin mencatat pengeluaran, gunakan tombol 'Bayar (+ Catat)')`);
    } else {
      alert(`Status tagihan "${rem.title}" berhasil diubah menjadi BELUM DIBAYAR.`);
    }
  };

  // Pay Reminder (Mark Paid & optionally post to main Ledgers / Expenses automatically!)
  const handleMarkAsPaid = (rem: Reminder) => {
    const confirmPay = window.confirm(
      `Apakah Anda ingin menandai "${rem.title}" senilai ${formatIDR(rem.amount)} sebagai TELAH DIBAYAR?\n\nKlik OK untuk menandai lunas dan mencatat transaksi ini otomatis ke Buku Pengeluaran Operasional Toko!`
    );

    if (!confirmPay) return;

    // 1. Mark reminder as paid in database
    const updated: Reminder = {
      ...rem,
      isPaid: true
    };
    onUpdateReminder(updated);

    // 2. Post as a normal operational Expense row entry automatically!
    const expenseData = {
      title: `[Bayar Tagihan] ${rem.title}`,
      amount: rem.amount,
      category: rem.category,
      date: todayStr,
      paymentMethod: "Tunai",
      notes: `Lunas otomatis via Pengingat Tagihan. Tanggal asal jatuh tempo: ${formatTanggal(rem.dueDate)}. Note: ${rem.notes || "-"}`
    };
    onAddExpense(expenseData);

    // 3. If it is a recurring monthly or weekly Thursday reminder, automatically generate the next reminder!
    if (rem.repeatMonthly) {
      const calculateNextMonthDueDate = (currentDueDateStr: string): string => {
        const parts = currentDueDateStr.split("-");
        if (parts.length !== 3) return currentDueDateStr;
        const [year, month, day] = parts.map(Number);
        let nextYear = year;
        let nextMonth = month + 1;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear += 1;
        }
        // Handle overflow of days (e.g. Feb 31st, or 31st of some month going to 30th)
        const lastDayOfNextMonth = new Date(nextYear, nextMonth, 0).getDate();
        const targetDay = Math.min(day, lastDayOfNextMonth);
        
        const nextMonthStr = String(nextMonth).padStart(2, "0");
        const nextDayStr = String(targetDay).padStart(2, "0");
        return `${nextYear}-${nextMonthStr}-${nextDayStr}`;
      };

      const nextDueDate = calculateNextMonthDueDate(rem.dueDate);
      const freshNext: Reminder = {
        id: "rem-" + (Date.now() + 100),
        title: rem.title,
        amount: rem.amount,
        dueDate: nextDueDate,
        dueTime: rem.dueTime || "12:00",
        isPaid: false,
        category: rem.category,
        notes: rem.notes,
        userId: rem.userId || ownerId || "guest",
        createdAt: new Date().toISOString(),
        repeatMonthly: true
      };
      onAddReminder(freshNext);
      alert(`Sukses! Tagihan ditandai lunas & dicatatkan otomatis di Buku Pengeluaran.\n\nKarena ini adalah tagihan bulanan berulang, sistem telah otomatis membuat tagihan baru untuk bulan berikutnya pada tanggal ${formatTanggal(nextDueDate)}! ✨`);
    } else if (rem.repeatWeeklyThursday) {
      const calculateNextThursdayDueDate = (currentDueDateStr: string): string => {
        // Find next Thursday (day 4) starting from the day after the current due date
        const d = new Date(currentDueDateStr);
        if (isNaN(d.getTime())) return currentDueDateStr;
        d.setDate(d.getDate() + 1);
        while (d.getDay() !== 4) { // 4 is Thursday
          d.setDate(d.getDate() + 1);
        }
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      const nextDueDate = calculateNextThursdayDueDate(rem.dueDate);
      const freshNext: Reminder = {
        id: "rem-" + (Date.now() + 100),
        title: rem.title,
        amount: rem.amount,
        dueDate: nextDueDate,
        dueTime: rem.dueTime || "12:00",
        isPaid: false,
        category: rem.category,
        notes: rem.notes,
        userId: rem.userId || ownerId || "guest",
        createdAt: new Date().toISOString(),
        repeatWeeklyThursday: true
      };
      onAddReminder(freshNext);
      alert(`Sukses! Tagihan ditandai lunas & dicatatkan otomatis di Buku Pengeluaran.\n\nKarena ini adalah tagihan mingguan berulang (Setiap Kamis), sistem telah otomatis membuat tagihan baru untuk hari Kamis berikutnya pada tanggal ${formatTanggal(nextDueDate)}! ✨`);
    } else {
      alert(`Sukses! Tagihan ditandai lunas & dicatatkan otomatis di Buku Pengeluaran.`);
    }
  };

  // Re-open/Mark unpaid
  const handleMarkAsUnpaid = (rem: Reminder) => {
    if (window.confirm(`Unduh status bayar "${rem.title}" kembali menjadi Belum Lunas?`)) {
      onUpdateReminder({
        ...rem,
        isPaid: false
      });
    }
  };

  // Save WhatsApp settings directly to Firestore
  const handleSaveSettings = async () => {
    if (!ownerId || ownerId === "guest") {
      alert("Gagal menyimpan: Fitur otomatisasi WhatsApp membutuhkan login akun Owner. Harap login terlebih dahulu.");
      return;
    }

    if (gateway !== "manual" && !ownerWaNumber.trim() && !ownerWaNumber2.trim()) {
      alert("Harap masukkan setidaknya satu Nomor WhatsApp Owner.");
      return;
    }

    if (gateway === "fonnte" && !fonnteToken.trim()) {
      alert("Harap isi Token API Fonnte Anda.");
      return;
    }

    if (gateway === "generic" && !fonnteToken.trim().startsWith("http")) {
      alert("Untuk gerbang kustom Webhook, isi Token dengan URL Webhook endpoint lengkap (http...)");
      return;
    }

    setIsSaving(true);
    try {
      const settingsRef = doc(db, "users", ownerId, "settings", "whatsapp");
      await setDoc(settingsRef, {
        ownerWaNumber: ownerWaNumber.trim(),
        ownerWaNumber2: ownerWaNumber2.trim(),
        isEnabled,
        fonnteToken: fonnteToken.trim(),
        gateway,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      alert("Pengaturan WhatsApp berhasil disimpan ke cloud! Sistem otomatisasi background akan mengecek dan mengirimkan tagihan jatuh tempo ke WhatsApp Anda secara berkala.");
    } catch (err: any) {
      console.error(err);
      alert("Gagal menyimpan ke Firestore: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Direct 1-Click WhatsApp Trigger (Manual Fallback)
  const handleManualWhatsAppClick = (rem: Reminder) => {
    const formattedAmount = formatIDR(rem.amount);
    const formattedDate = formatTanggal(rem.dueDate);
    const message = `📢 *PENGINGAT TAGIHAN OPERASIONAL TOKO* 🧺\n\nHalo Bos Owner DamDam Laundry!\nBerikut info tagihan aktif ruko yang perlu diselesaikan hari ini:\n\n*${rem.title.toUpperCase()}*\n💸 Jumlah: *${formattedAmount}*\n📅 Jatuh Tempo: *${formattedDate}*\n🏷️ Kategori: ${rem.category}\n${rem.notes ? `💡 Catatan: ${rem.notes}\n` : ""}\nMohon segera diselesaikan agar operasional outlet tetap berjalan lancar. Terimakasih! 🙏😊`;
    
    const encodedMessage = encodeURIComponent(message);
    
    let targetPhone = ownerWaNumber;
    if (ownerWaNumber2 && ownerWaNumber2.trim()) {
      const chooseOwner2 = window.confirm(`Kirim ke Owner 2 (${ownerWaNumber2})?\n\nKlik OK untuk mengirim ke Owner 2, atau klik Batal untuk mengirim ke Owner 1 (${ownerWaNumber}).`);
      if (chooseOwner2) {
        targetPhone = ownerWaNumber2;
      }
    }

    // Clean target phone
    let cleanPhone = targetPhone.trim().replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "62" + cleanPhone.slice(1);
    }

    const url = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`
      : `https://api.whatsapp.com/send?text=${encodedMessage}`;
    
    window.open(url, "_blank");
  };

  // Test WhatsApp message send trigger via Server proxy
  const handleSendTestMessage = async () => {
    if (!ownerWaNumber && !ownerWaNumber2) {
      alert("Harap isi setidaknya satu Nomor WhatsApp Owner terlebih dahulu!");
      return;
    }
    setIsSendingTest(true);
    try {
      const testMsg = `🤖 *UJI COBA INTEGRASI WHATSAPP* ⚡\n\nHalo Bos Owner DamDam Laundry!\nSelamat! Jalur koneksi WhatsApp Gateway Anda dengan sistem DamDam POS telah BERHASIL terhubung dan AKTIF.\n\nSistem POS sekarang siap mengirimkan rekap tagihan sewa ruko, gaji karyawan, dan listrik secara otomatis ke nomor Anda. Mantap! 👍🎉`;
      
      const phonesToSend = [];
      if (ownerWaNumber && ownerWaNumber.trim()) phonesToSend.push(ownerWaNumber.trim());
      if (ownerWaNumber2 && ownerWaNumber2.trim()) phonesToSend.push(ownerWaNumber2.trim());

      let successCount = 0;
      for (const phone of phonesToSend) {
        const response = await fetch("/api/whatsapp/send-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: phone,
            message: testMsg,
            token: fonnteToken,
            gateway: gateway
          })
        });
        const data = await response.json();
        if (data.success) {
          successCount++;
        }
      }

      if (successCount === phonesToSend.length) {
        alert("Sukses! Pesan tes berhasil dikirim ke semua nomor WhatsApp Owner. Silakan periksa chat masuk di HP Anda.");
      } else if (successCount > 0) {
        alert(`Berhasil mengirim ke ${successCount} nomor, namun ada yang gagal. Periksa kembali format nomor.`);
      } else {
        alert("Gagal mengirim pesan tes ke nomor manapun. Pastikan Gateway Token Anda aktif.");
      }
    } catch (err: any) {
      alert("Error memanggil API server: " + err.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  // Manual cron trigger check
  const handleManualCheckBills = async () => {
    if (!ownerId || ownerId === "guest") {
      alert("Gagal memicu pengecekan: Login akun Owner diperlukan.");
      return;
    }
    setIsTriggeringCheck(true);
    try {
      const response = await fetch("/api/whatsapp/check-and-send-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: ownerId })
      });
      const data = await response.json();
      if (data.success) {
        const report = data.report;
        if (report.status === "sent") {
          alert(`Sukses! Ditemukan ${report.count} tagihan jatuh tempo aktif. Rekap tagihan senilai Rp ${report.totalAmount.toLocaleString("id-ID")} telah dikirimkan ke nomor WhatsApp Owner!`);
        } else if (report.status === "no_bills") {
          alert("Laporan: Tidak ditemukan tagihan jatuh tempo hari ini yang belum dibayar. Semuanya aman!");
        } else if (report.status === "disabled") {
          alert("Gagal: Fitur otomatisasi dinonaktifkan. Tolong aktifkan toggle 'Status Otomatisasi WA' terlebih dahulu di Tab Pengaturan.");
        } else {
          alert("Laporan: " + report.message);
        }
      } else {
        alert("Gagal memicu pengecekan server: " + data.error);
      }
    } catch (err: any) {
      alert("Error memanggil API: " + err.message);
    } finally {
      setIsTriggeringCheck(false);
    }
  };

  // Filtered and searched list
  const filteredReminders = useMemo(() => {
    let result = safeReminders.filter(r => {
      if (!r) return false;
      // search query matches
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const matchesTitle = (r.title || "").toLowerCase().includes(query);
        const matchesNotes = r.notes?.toLowerCase().includes(query) || false;
        const matchesCategory = (r.category || "").toLowerCase().includes(query);
        return matchesTitle || matchesNotes || matchesCategory;
      }
      return true;
    });

    // status filters
    if (statusFilter === "belum") {
      result = result.filter(r => r && !r.isPaid && (r.dueDate || "") >= todayStr);
    } else if (statusFilter === "lunas") {
      result = result.filter(r => r && r.isPaid);
    } else if (statusFilter === "terlambat") {
      result = result.filter(r => r && !r.isPaid && (r.dueDate || "") < todayStr);
    }

    // Sort: Unpaid first, then by dueDate ascending, then paid ones
    return [...result].sort((a, b) => {
      if (!a || !b) return 0;
      if (a.isPaid !== b.isPaid) {
        return a.isPaid ? 1 : -1; // unpaid first
      }
      const valA = a.dueDate || "";
      const valB = b.dueDate || "";
      return valA.localeCompare(valB);
    });
  }, [safeReminders, searchQuery, statusFilter, todayStr]);

  const rawCategories = [
    "Detergen & Sabun",
    "Listrik & Air",
    "Sewa & Utilitas",
    "Gaji Karyawan",
    "Pemeliharaan Mesin",
    "Pemasaran & Iklan",
    "Plastik",
    "Lain-lain"
  ];

  return (
    <div id="bill-reminders-root" className="flex-1 flex flex-col overflow-hidden bg-zinc-50 font-sans relative">
      {/* 1. Header Bar */}
      <div className="p-3 bg-white border-b border-zinc-200 flex items-center justify-between shrink-0 flex-wrap gap-2 shadow-sm">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onSetSubTab("home")}
            className="p-1.5 px-2.5 bg-zinc-150 border border-zinc-250 hover:border-emerald-500 duration-150 text-zinc-700 hover:text-black hover:bg-zinc-200 text-[10px] font-black uppercase rounded-lg"
          >
            &larr; POS HOME
          </button>
          <div className="h-5 w-[1px] bg-zinc-300" />
          <h2 className="text-xs font-black text-zinc-900 flex items-center gap-1.5 tracking-wider uppercase font-mono">
            <Bell className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
            <span>Pengingat & Notifikasi Tagihan</span>
          </h2>
        </div>

        {activeTab === "list" && (
          <button
            onClick={() => {
              if (showAddForm) {
                resetForm();
              } else {
                setShowAddForm(true);
              }
            }}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 px-3 text-[10px] font-bold uppercase tracking-wider rounded-lg cursor-pointer duration-150 active:scale-95 transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showAddForm ? "Batal" : "Buat Tagihan Baru"}</span>
          </button>
        )}
      </div>

      {/* 2. Navigation Tabs */}
      <div className="bg-white border-b border-zinc-200 px-4 flex gap-4 shrink-0 shadow-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab("list")}
          className={`py-3 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "list"
              ? "border-emerald-600 text-emerald-600 font-extrabold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          📂 Daftar Tagihan ({safeReminders.length})
        </button>
        <button
          onClick={() => setActiveTab("shift")}
          className={`py-3 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "shift"
              ? "border-emerald-600 text-emerald-600 font-extrabold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <RotateCw className="w-3.5 h-3.5 text-emerald-600" />
          <span>Jadwal Shift ({internalKaryawan.length} Staf)</span>
        </button>
        <button
          onClick={() => setActiveTab("whatsapp")}
          className={`py-3 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "whatsapp"
              ? "border-emerald-600 text-emerald-600 font-extrabold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
          <span>Pengaturan WhatsApp {isEnabled && "🟢"}</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto bg-zinc-50 font-sans">
        {activeTab === "shift" && (
          <div className="p-3 sm:p-5 bg-[#0A0A0B] min-h-full w-full max-w-full overflow-x-hidden">
            <ShiftManagementTab
              ownerId={ownerId || ""}
              karyawanList={internalKaryawan}
              onNavigateToWhatsAppTab={() => setActiveTab("whatsapp")}
            />
          </div>
        )}

        {activeTab === "list" && (
          <div className="p-4 md:p-6 space-y-4">
            {/* 3. Stats Dashboard Mini */}
            <div className="grid grid-cols-3 gap-3 bg-white border border-zinc-200 p-3 rounded-2xl select-none shadow-xs">
              <div id="stat-unpaid" className="bg-[#fefaf0] border border-amber-200 p-2.5 rounded-xl text-center relative overflow-hidden">
                <p className="text-[8.5px] text-amber-800 font-extrabold uppercase tracking-wider">Belum Lunas</p>
                <p className="text-xs sm:text-sm font-black text-amber-600 font-mono mt-1">
                  {formatIDR(stats.totalUnpaid)}
                </p>
                <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              </div>
              <div id="stat-due" className="bg-[#fff5f5] border border-rose-200 p-2.5 rounded-xl text-center relative overflow-hidden">
                <p className="text-[8.5px] text-rose-800 font-extrabold uppercase tracking-wider font-sans">Jatuh Tempo Hari Ini</p>
                <p className="text-xs sm:text-sm font-black text-rose-600 font-mono mt-1">
                  {stats.dueSoonCount} <span className="text-[8.5px] text-rose-500 font-bold">Tagihan</span>
                </p>
                {stats.dueSoonCount > 0 && (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                )}
              </div>
              <div id="stat-overdue" className="bg-[#fff0f0] border border-red-200 p-2.5 rounded-xl text-center relative overflow-hidden">
                <p className="text-[8.5px] text-red-800 font-extrabold uppercase tracking-wider font-sans">Terlambat</p>
                <p className="text-xs sm:text-sm font-black text-red-600 font-mono mt-1">
                  {stats.overdueCount} <span className="text-[8.5px] text-red-500 font-bold">Tagihan</span>
                </p>
                {stats.overdueCount > 0 ? (
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                ) : (
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-zinc-300 rounded-full" />
                )}
              </div>
            </div>

            {/* Filters & Search Row */}
            <div className="p-3 bg-white border border-zinc-200 rounded-xl flex flex-col sm:flex-row gap-2.5 items-center justify-between shadow-xs font-sans">
              <div className="w-full sm:w-auto flex items-center relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3" />
                <input
                  type="text"
                  placeholder="Cari deskripsi tagihan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-50 hover:bg-zinc-100/50 focus:bg-white border border-zinc-250 focus:border-emerald-500 rounded-xl pl-9 p-2 text-[11px] text-zinc-800 outline-none font-sans h-10 transition-all duration-150"
                />
              </div>

              <div className="w-full sm:w-auto flex items-center gap-1.5 whitespace-nowrap overflow-x-auto self-end sm:self-auto py-1">
                <span className="text-[10px] text-zinc-500 font-black uppercase tracking-wide mr-1 select-none flex items-center gap-0.5">
                  <Filter className="w-3 h-3 text-zinc-450" /> Filter:
                </span>
                {(["semua", "belum", "terlambat", "lunas"] as const).map((filterOpt) => {
                  const labelMap = {
                    semua: "Semua",
                    belum: "Belum Bayar",
                    terlambat: "Terlambat",
                    lunas: "Lunas"
                  };
                  const countBadgeMap = {
                    semua: safeReminders.length,
                    belum: safeReminders.filter(r => r && !r.isPaid && (r.dueDate || "") >= todayStr).length,
                    terlambat: safeReminders.filter(r => r && !r.isPaid && (r.dueDate || "") < todayStr).length,
                    lunas: safeReminders.filter(r => r && r.isPaid).length
                  };
                  const isActive = statusFilter === filterOpt;
                  return (
                    <button
                      key={filterOpt}
                      onClick={() => setStatusFilter(filterOpt)}
                      className={`px-3 py-1.5 text-[9.5px] font-black uppercase rounded-lg cursor-pointer duration-150 border transition-all ${
                        isActive 
                          ? "bg-emerald-600 border-transparent text-white shadow-xs" 
                          : "bg-zinc-100 hover:bg-zinc-200 border-zinc-250 text-zinc-700"
                      }`}
                    >
                      {labelMap[filterOpt]} ({countBadgeMap[filterOpt]})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actual List */}
            <div className="space-y-3 font-sans">
              {filteredReminders.length === 0 ? (
                <div className="text-center py-14 border border-dashed border-zinc-200 bg-white rounded-2xl p-6 select-none shadow-xs font-sans">
                  <FileText className="w-10 h-10 text-zinc-300 mx-auto mb-2 animate-pulse" />
                  <p className="text-[11.5px] text-zinc-500 font-extrabold uppercase tracking-wider">
                    {searchQuery ? "Tidak ditemukan tagihan yang cocok dengan pencarian!" : "Belum ada pengingat tagihan aktif."}
                  </p>
                  {!showAddForm && (
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="mt-3.5 text-[10px] font-black text-emerald-600 hover:text-emerald-500 uppercase tracking-widest border border-emerald-250 bg-emerald-50 px-3.5 py-1.5 rounded-lg cursor-pointer duration-150 transition-all hover:bg-emerald-100"
                    >
                      Buat Pengingat Pertama Anda Sekarang
                    </button>
                  )}
                </div>
              ) : (
                filteredReminders.map((rem) => {
                  const isOverdue = !rem.isPaid && rem.dueDate < todayStr;
                  const isDueToday = !rem.isPaid && rem.dueDate === todayStr;

                  let overdueDaysStr = "";
                  if (isOverdue) {
                    const dateA = new Date(rem.dueDate || "");
                    const dateB = new Date(todayStr);
                    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
                      const diffTime = Math.abs(dateB.getTime() - dateA.getTime());
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      overdueDaysStr = `${diffDays} Hari`;
                    }
                  }

                  return (
                    <div
                      key={rem.id}
                      className={`border p-4 sm:p-5 rounded-2xl transition duration-150 shadow-xs ${
                        rem.isPaid
                          ? "bg-zinc-50/90 border-zinc-200 text-zinc-400"
                          : isOverdue
                          ? "bg-rose-50/70 border-rose-250 hover:bg-rose-50"
                          : isDueToday
                          ? "bg-amber-50/70 border-amber-250 hover:bg-amber-50"
                          : "bg-white border-zinc-200 hover:border-emerald-300"
                      }`}
                    >
                      {/* 2-Column Grid Layout */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* COL 1: Informasi Detail Tagihan */}
                        <div className="space-y-2.5 min-w-0">
                          {/* Category & Badges */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-black px-2.5 py-1 bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-lg uppercase font-mono tracking-wider flex items-center gap-1 shrink-0">
                              <Tag className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span>{rem.category}</span>
                            </span>

                            {rem.repeatMonthly && (
                              <span className="text-[9.5px] font-black px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg uppercase tracking-wider shrink-0 font-sans">
                                🔄 Bulanan
                              </span>
                            )}

                            {rem.repeatWeeklyThursday && (
                              <span className="text-[9.5px] font-black px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg uppercase tracking-wider shrink-0 font-sans">
                                🔄 Setiap Kamis
                              </span>
                            )}

                            {rem.waNotificationSent && (
                              <span className="text-[9.5px] font-black px-2 py-0.5 bg-emerald-50 border border-emerald-250 text-emerald-700 rounded-lg uppercase tracking-wider flex items-center gap-1 shrink-0 font-sans">
                                <Check className="w-3 h-3 text-emerald-600 shrink-0" /> WA Sent
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <div className="pt-0.5">
                            <h4 className={`text-sm sm:text-base font-black uppercase tracking-wide leading-snug break-normal ${rem.isPaid ? "line-through text-zinc-400 font-sans" : "text-zinc-900 font-mono"}`}>
                              {rem.title}
                            </h4>
                            {rem.notes && (
                              <p className="text-[11px] text-zinc-600 mt-1.5 font-sans whitespace-pre-wrap leading-relaxed bg-zinc-100/80 p-2.5 rounded-xl border border-zinc-200/80">
                                💡 {rem.notes}
                              </p>
                            )}
                          </div>

                          {/* Date & Time */}
                          <div className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider flex flex-wrap items-center gap-2 font-mono pt-0.5">
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <span>Jatuh Tempo:</span>
                              <span className={`font-black ${rem.isPaid ? "text-zinc-500" : isOverdue ? "text-rose-600" : isDueToday ? "text-amber-600" : "text-zinc-900"}`}>
                                {formatTanggal(rem.dueDate)}
                              </span>
                            </span>
                            {rem.dueTime && (
                              <span className="flex items-center gap-1 bg-zinc-100 border border-zinc-200 rounded-md px-2 py-0.5 text-zinc-700 font-sans text-[10px] whitespace-nowrap">
                                <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
                                <span>Pukul {rem.dueTime}</span>
                              </span>
                            )}
                          </div>

                          {/* Status Dropdown Selector (Di bawah Tulisan Status) */}
                          <div className="pt-1.5 flex flex-col items-start gap-1">
                            <span className="text-[10px] text-zinc-400 font-extrabold uppercase font-sans tracking-wider">Status:</span>
                            <select
                              value={rem.isPaid ? "paid" : "unpaid"}
                              onChange={(e) => {
                                const wantPaid = e.target.value === "paid";
                                if (wantPaid === rem.isPaid) return;
                                handleDirectStatusChange(rem, wantPaid);
                              }}
                              className={`w-full max-w-[200px] text-[9.5px] sm:text-[10px] font-black px-2.5 py-1.5 rounded-lg uppercase tracking-wider cursor-pointer border outline-none font-sans transition-all shrink-0 ${
                                rem.isPaid
                                  ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                                  : isOverdue
                                  ? "bg-rose-100 border-rose-300 text-rose-800"
                                  : isDueToday
                                  ? "bg-amber-100 border-amber-300 text-amber-800"
                                  : "bg-zinc-100 border-zinc-300 text-zinc-700"
                              }`}
                              title="Ubah Status Pembayaran Manual"
                            >
                              <option value="unpaid">🔴 BELUM DIBAYAR</option>
                              <option value="paid">🟢 SUDAH DIBAYAR</option>
                            </select>
                          </div>
                        </div>

                        {/* COL 2: Nominal, Status & Tombol Aksi */}
                        <div className="flex flex-col justify-between space-y-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-dashed border-zinc-200 sm:border-l sm:border-zinc-200 sm:pl-4 min-w-0">
                          {/* Nominal Header */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-wider font-sans select-none">
                                Jumlah Tagihan
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className={`text-base sm:text-lg font-black font-mono tracking-tight ${rem.isPaid ? "text-zinc-400" : isOverdue ? "text-rose-600" : isDueToday ? "text-amber-600" : "text-emerald-600"}`}>
                                {formatIDR(rem.amount)}
                              </p>

                              {isOverdue && !rem.isPaid && (
                                <span className="text-[9.5px] font-black px-2.5 py-0.5 bg-rose-100 border border-rose-250 text-rose-700 rounded-lg uppercase tracking-wider flex items-center gap-1 animate-pulse font-sans">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  Terlambat {overdueDaysStr ? `(${overdueDaysStr})` : ""}
                                </span>
                              )}

                              {isDueToday && !rem.isPaid && (
                                <span className="text-[9.5px] font-black px-2.5 py-0.5 bg-amber-100 border border-amber-250 text-amber-700 rounded-lg uppercase tracking-wider flex items-center gap-1 animate-pulse font-sans">
                                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  Hari Ini!
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Tombol Aksi */}
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-200/80">
                            {!rem.isPaid && (
                              <button
                                onClick={() => handleManualWhatsAppClick(rem)}
                                className="bg-[#25D366] hover:bg-[#20ba5a] text-white h-9 px-3 rounded-xl font-bold transition duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs text-xs font-sans shrink-0"
                                title="Kirim Pengingat ke WhatsApp"
                              >
                                <MessageSquare className="w-4 h-4" />
                                <span>WA</span>
                              </button>
                            )}

                            {!rem.isPaid ? (
                              <button
                                onClick={() => handleMarkAsPaid(rem)}
                                className={`flex-1 min-w-[120px] h-9 px-3 rounded-xl uppercase font-black tracking-wider transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs font-sans text-white text-[10.5px] ${
                                  isOverdue 
                                    ? "bg-rose-600 hover:bg-rose-500" 
                                    : isDueToday
                                    ? "bg-amber-500 hover:bg-amber-400 text-black border-transparent"
                                    : "bg-emerald-600 hover:bg-emerald-500"
                                }`}
                                title="Klik untuk BAYAR: Menandai Lunas dan OTOMATIS mencatat ke Catatan Pengeluaran"
                              >
                                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Bayar (+ Catat)</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDirectStatusChange(rem, false)}
                                className="flex-1 min-w-[120px] h-9 px-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 font-extrabold uppercase tracking-wider text-[10px] flex items-center justify-center font-sans"
                                title="Ubah status kembali menjadi Belum Dibayar"
                              >
                                Tandai Belum Dibayar
                              </button>
                            )}

                            <div className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
                              <button
                                onClick={() => handleStartEdit(rem)}
                                className="bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-300 h-9 w-9 rounded-xl transition duration-150 cursor-pointer flex items-center justify-center shrink-0"
                                title="Ubah Pengingat"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => {
                                  if (window.confirm(`Hapus pengingat "${rem.title}"?`)) {
                                    onDeleteReminder(rem.id);
                                  }
                                }}
                                className="bg-white hover:bg-rose-50 border border-zinc-300 hover:border-rose-300 text-zinc-500 hover:text-rose-600 h-9 w-9 transition duration-150 rounded-xl cursor-pointer flex items-center justify-center shrink-0"
                                title="Hapus Pengingat"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Native browser notifications info card */}
            <div id="pwa-notification-card" className="bg-white border border-zinc-200 rounded-2xl shadow-xs p-4 sm:p-5 relative transition duration-150 hover:shadow-xs font-sans mt-4">
              <div className="pb-3 border-b border-zinc-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <Smartphone className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="font-black uppercase text-zinc-900 tracking-wider font-mono text-[10.5px] leading-tight flex items-center gap-1.5">
                      Alternatif: Notifikasi Di Bar Browser HP
                    </h3>
                    <p className="text-[9px] text-zinc-500 font-medium">Bekerja di latar belakang (PWA native)</p>
                  </div>
                </div>

                {notificationPermission === "granted" ? (
                  <span className="font-mono text-[8.5px] font-black px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full animate-pulse uppercase">
                    Aktif 🟢
                  </span>
                ) : notificationPermission === "denied" ? (
                  <span className="font-mono text-[8.5px] font-black px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-full uppercase">
                    Diblokir ❌
                  </span>
                ) : (
                  <span className="font-mono text-[8.5px] font-black px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-full uppercase">
                    Pending 🟡
                  </span>
                )}
              </div>

              <div className="mt-3.5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <p className="text-zinc-600 text-[10.5px] leading-relaxed max-w-2xl font-medium">
                  Selain via WhatsApp, Anda juga bisa mengaktifkan push notifications browser agar HP Anda bergetar/berbunyi secara native ketika tagihan penting ruko atau payroll jatuh tempo.
                </p>

                <div className="flex items-center gap-2 w-full md:w-auto shrink-0 font-sans">
                  <button
                    onClick={requestNotificationPermission}
                    className={`flex-grow md:flex-none py-2 px-4 text-[10px] font-black uppercase tracking-wider transition-all duration-150 rounded-xl border text-center flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] ${
                      notificationPermission === "granted"
                        ? "bg-[#0d2a1f]/10 border-emerald-100 text-emerald-600 cursor-default"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white border-transparent shadow-xs"
                    }`}
                    disabled={notificationPermission === "granted"}
                  >
                    <Bell className="w-3.5 h-3.5 shrink-0" />
                    <span>{notificationPermission === "granted" ? "Sistem Terhubung" : "Aktifkan Notifikasi HP"}</span>
                  </button>

                  {notificationPermission === "granted" && (
                    <button
                      onClick={triggerTestNotification}
                      className="flex-grow md:flex-none bg-zinc-100 hover:bg-zinc-200 border border-zinc-250 text-zinc-700 hover:text-black py-2 px-3 text-[10px] font-black uppercase tracking-wider transition-all duration-150 rounded-xl cursor-pointer text-center flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    >
                      <Share2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Uji Coba ⚡</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "whatsapp" && (
          /* WhatsApp Settings Tab Panel */
          <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 md:p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-3 border-b border-zinc-100 pb-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider font-mono text-zinc-900 leading-tight">
                    Pengaturan WhatsApp Otomatis
                  </h3>
                  <p className="text-[9.5px] text-zinc-500 font-semibold">Hubungkan POS dengan WhatsApp Owner untuk digest tagihan otomatis</p>
                </div>
              </div>

              {(!ownerId || ownerId === "guest") ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center text-amber-850 text-[11px] font-semibold">
                  ⚠️ Peringatan: Anda saat ini masuk sebagai Guest (Tamu). Untuk mengonfigurasi dan mengaktifkan notifikasi WhatsApp otomatis ke Cloud Firestore, silakan login dengan akun Owner utama Anda terlebih dahulu!
                </div>
              ) : null}

              <div className="space-y-4">
                {/* 1. Toggle Activation */}
                <div className="flex items-center justify-between p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                  <div>
                    <span className="block text-[11px] font-black text-zinc-900 uppercase font-mono">
                      Status Otomatisasi WA
                    </span>
                    <span className="text-[10px] text-zinc-500">Aktifkan sistem robot untuk mengecek tagihan & mengirim chat</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={isEnabled}
                      onChange={(e) => setIsEnabled(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {/* 2. Owner Phone Number Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider font-mono">
                      Nomor WhatsApp Owner 1 (Utama)
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: 08123456789 atau 628123456789"
                      value={ownerWaNumber}
                      onChange={(e) => setOwnerWaNumber(e.target.value)}
                      className="w-full bg-zinc-50 hover:bg-zinc-100/50 focus:bg-white border border-zinc-250 focus:border-emerald-500 rounded-xl p-3 text-xs outline-none transition h-11 text-zinc-800"
                    />
                    <p className="text-[9px] text-zinc-400">Penerima pengingat utama.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider font-mono">
                      Nomor WhatsApp Owner 2 (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: 08987654321 atau 628987654321"
                      value={ownerWaNumber2}
                      onChange={(e) => setOwnerWaNumber2(e.target.value)}
                      className="w-full bg-zinc-50 hover:bg-zinc-100/50 focus:bg-white border border-zinc-250 focus:border-emerald-500 rounded-xl p-3 text-xs outline-none transition h-11 text-zinc-800"
                    />
                    <p className="text-[9px] text-zinc-400">Penerima pengingat sekunder (Owner ke-2).</p>
                  </div>
                </div>

                {/* 3. Gateway Provider Selection */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider font-mono">
                    Gerbang Pengiriman (WhatsApp Gateway)
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setGateway("manual")}
                      className={`p-3 rounded-xl border text-[10.5px] font-bold text-center cursor-pointer transition ${
                        gateway === "manual" 
                          ? "bg-emerald-50 border-emerald-500 text-emerald-700" 
                          : "bg-white border-zinc-250 text-zinc-650 hover:bg-zinc-50"
                      }`}
                    >
                      💡 Direct WA.me
                    </button>
                    <button
                      type="button"
                      onClick={() => setGateway("fonnte")}
                      className={`p-3 rounded-xl border text-[10.5px] font-bold text-center cursor-pointer transition ${
                        gateway === "fonnte" 
                          ? "bg-emerald-50 border-emerald-500 text-emerald-700" 
                          : "bg-white border-zinc-250 text-zinc-650 hover:bg-zinc-50"
                      }`}
                    >
                      🤖 Fonnte API
                    </button>
                    <button
                      type="button"
                      onClick={() => setGateway("generic")}
                      className={`p-3 rounded-xl border text-[10.5px] font-bold text-center cursor-pointer transition ${
                        gateway === "generic" 
                          ? "bg-emerald-50 border-emerald-500 text-emerald-700" 
                          : "bg-white border-zinc-250 text-zinc-650 hover:bg-zinc-50"
                      }`}
                    >
                      🔗 Webhook API
                    </button>
                  </div>
                </div>

                {/* 4. API Key / Endpoint depending on Selection */}
                {gateway === "manual" && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                    <p className="text-[10.5px] text-emerald-850 font-bold">Mode Direct WA.me Aktif! 🚀</p>
                    <p className="text-[10px] text-emerald-750 leading-relaxed font-medium">
                      Ini adalah gerbang manual gratis yang selalu berhasil tanpa setting API berbayar. Cukup klik tombol berlogo WhatsApp berwarna hijau di sebelah tagihan Anda, dan chat pengingat akan langsung terkompilasi dan terbuka di WhatsApp Anda. Sangat praktis!
                    </p>
                  </div>
                )}

                {gateway === "fonnte" && (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider font-mono">
                      Token API Fonnte Anda
                    </label>
                    <input
                      type="password"
                      placeholder="Masukkan Token API Fonnte Anda..."
                      value={fonnteToken}
                      onChange={(e) => setFonnteToken(e.target.value)}
                      className="w-full bg-zinc-50 hover:bg-zinc-100/50 focus:bg-white border border-zinc-250 focus:border-emerald-500 rounded-xl p-3 text-xs outline-none transition h-11 text-zinc-800 font-mono"
                    />
                    <div className="p-3 bg-zinc-50 border border-zinc-250 rounded-xl text-[10px] text-zinc-600 leading-relaxed space-y-1">
                      <p className="font-bold text-zinc-800">Cara Mendapatkan Token Fonnte Gratis:</p>
                      <ul className="list-disc list-inside space-y-1 pl-1">
                        <li>Buka situs <a href="https://fonnte.com" target="_blank" className="text-emerald-600 hover:underline font-black">fonnte.com</a> lalu daftarkan akun gratis.</li>
                        <li>Hubungkan nomor HP WhatsApp Anda pada menu <strong className="text-zinc-800">Device</strong> di dashboard Fonnte.</li>
                        <li>Copy <strong className="text-zinc-800">Token</strong> device Anda dan paste pada kotak isian di atas.</li>
                      </ul>
                    </div>
                  </div>
                )}

                {gateway === "generic" && (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider font-mono">
                      URL Endpoint Webhook Lengkap
                    </label>
                    <input
                      type="text"
                      placeholder="https://api.gateway.com/custom-send-route"
                      value={fonnteToken}
                      onChange={(e) => setFonnteToken(e.target.value)}
                      className="w-full bg-zinc-50 hover:bg-zinc-100/50 focus:bg-white border border-zinc-250 focus:border-emerald-500 rounded-xl p-3 text-xs outline-none transition h-11 text-zinc-800 font-mono"
                    />
                    <p className="text-[9px] text-zinc-400">Sistem akan melakukan HTTP POST request dengan format JSON: {'{ "phone": "...", "message": "..." }'}</p>
                  </div>
                )}

                {gateway !== "manual" && (
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-[10px] text-blue-800 leading-relaxed space-y-1.5 animate-fade-in">
                    <p className="font-bold text-blue-900 flex items-center gap-1">
                      <span>⚡</span> Cara Otomatis Tanpa Membuka Aplikasi (Sangat Direkomendasikan):
                    </p>
                    <p className="text-blue-700 font-medium">
                      Karena aplikasi ini berjalan di Cloud Serverless, jika Anda menutup browser, server akan masuk ke mode "tidur" untuk menghemat daya. Supaya pesan bisa terkirim otomatis tepat waktu <strong>setiap menit/jam</strong> tanpa perlu membuka aplikasi ini, silakan buat Cron Job gratis:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 pl-1 text-blue-750 font-medium">
                      <li>Buka situs gratis <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="text-blue-900 underline font-bold">cron-job.org</a></li>
                      <li>Daftar akun lalu buat Cron Job baru</li>
                      <li>Masukkan URL pemicu otomatis ini (URL Pratinjau Publik):
                        <div className="mt-1 flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-blue-200">
                          <code className="text-[9.5px] text-indigo-700 font-mono select-all break-all flex-1">
                            {getCronUrl()}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(getCronUrl());
                              alert("Link otomatis berhasil disalin! Gunakan link ini di cron-job.org");
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[9px] px-2 py-1 rounded cursor-pointer"
                          >
                            Salin
                          </button>
                        </div>
                        <p className="text-[8.5px] text-amber-850 font-bold mt-1">⚠️ Catatan: Link di atas secara otomatis diubah menjadi link publik (ais-pre) agar cron-job.org dapat menjangkaunya secara sukses tanpa terhalang autentikasi developer.</p>
                      </li>
                      <li>Atur jadwal eksekusi (misalnya setiap 5 menit atau setiap 1 jam)</li>
                    </ol>
                    <p className="text-[9.5px] text-blue-700/80 italic font-medium">Dengan ini, server Anda akan dibangunkan secara otomatis di latar belakang oleh cron-job.org untuk mengirimkan WhatsApp tepat pada waktunya!</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-4 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] py-3 px-4 rounded-xl cursor-pointer duration-150 shadow-sm flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Simpan Pengaturan</span>
                    </>
                  )}
                </button>

                {gateway !== "manual" && (
                  <button
                    type="button"
                    onClick={handleSendTestMessage}
                    disabled={isSendingTest || !ownerWaNumber}
                    className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-250 font-black uppercase text-[10px] py-3 px-4 rounded-xl cursor-pointer duration-150 flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    {isSendingTest ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengirim...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Kirim Chat Tes</span>
                      </>
                    )}
                  </button>
                )}

                {gateway !== "manual" && isEnabled && (
                  <button
                    type="button"
                    onClick={handleManualCheckBills}
                    disabled={isTriggeringCheck}
                    className="bg-[#0f172a] hover:bg-[#1e293b] text-white font-black uppercase text-[10px] py-3 px-4 rounded-xl cursor-pointer duration-150 flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    {isTriggeringCheck ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengecek...</span>
                      </>
                    ) : (
                      <>
                        <Bell className="w-3.5 h-3.5 text-amber-400" />
                        <span>Kirim Tagihan Hari Ini</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. FORM CONTAINER OVERLAY (FULL SCREEN / RESPONSIVE) */}
      {showAddForm && (
        <div id="reminder-form-block-overlay" className="fixed inset-0 z-50 overflow-y-auto bg-[#0A0A0BD6] backdrop-blur-md p-4 sm:p-6 pb-24 font-sans text-white text-xs animate-fade-in flex flex-col items-center justify-start min-h-screen">
          <div id="reminder-form-card" className="w-full max-w-xl bg-[#121214] border border-zinc-800 p-5 sm:p-7 space-y-6 rounded-xl shadow-2xl relative my-auto">
            <div id="reminder-form-header" className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <Plus className="w-4 h-4 text-emerald-400" />
                </span>
                <h3 className="text-sm font-black uppercase tracking-wider text-emerald-400 font-mono">
                  {editingId ? "Ubah Pengingat Tagihan" : "Tambah Tagihan Baru"}
                </h3>
              </div>
              <button
                id="btn-close-form-top"
                type="button"
                onClick={resetForm}
                className="px-3 py-1.5 text-[10px] bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 font-black uppercase rounded-lg cursor-pointer duration-150 transition-all"
              >
                Batal &times;
              </button>
            </div>

            <form id="reminder-form" onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 font-mono">
                  Nama / Deskripsi Tagihan *
                </label>
                <input
                  id="reminder-input-title"
                  type="text"
                  required
                  placeholder="Contoh: Sewa Toko Bulanan, Token Air..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/85 focus:ring-1 focus:ring-emerald-500/20 rounded-lg p-3.5 text-xs text-white uppercase font-mono tracking-wide placeholder-zinc-700 outline-none transition-all duration-150 h-12"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 font-mono">
                    Biaya Tagihan (IDR) *
                  </label>
                  <div className="flex relative">
                    <span className="absolute left-3.5 top-3 text-zinc-500 font-black text-xs">Rp</span>
                    <input
                      id="reminder-input-amount"
                      type="text"
                      required
                      placeholder="Contoh: 150.000"
                      value={amountStr}
                      onChange={(e) => handleAmountStrChange(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/85 focus:ring-1 focus:ring-emerald-500/20 rounded-lg pl-10 pr-3.5 py-3 text-xs text-white font-mono outline-none transition-all duration-150 h-12"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 font-mono">
                    Kategori Pengeluaran Toko
                  </label>
                  <select
                    id="reminder-select-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/85 focus:ring-1 focus:ring-emerald-500/20 rounded-lg px-3.5 py-2.5 text-xs text-white uppercase font-mono tracking-wider focus:outline-none transition-all duration-150 h-12 cursor-pointer"
                  >
                    {rawCategories.map((catOpt) => (
                      <option key={catOpt} value={catOpt}>
                        {catOpt.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 font-mono">
                    Tanggal Jatuh Tempo *
                  </label>
                  <div className="flex relative">
                    <Calendar className="absolute right-3.5 top-3.5 w-4 h-4 text-zinc-650 pointer-events-none" />
                    <input
                      id="reminder-input-duedate"
                      type="date"
                      required
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/85 focus:ring-1 focus:ring-emerald-500/20 rounded-lg p-3.5 pr-10 text-xs text-white font-mono outline-none transition-all duration-150 h-12 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 font-mono">
                    Jam Jatuh Tempo *
                  </label>
                  <div className="flex relative">
                    <Clock className="absolute right-3.5 top-3.5 w-4 h-4 text-zinc-650 pointer-events-none" />
                    <input
                      id="reminder-input-duetime"
                      type="time"
                      required
                      value={dueTime}
                      onChange={(e) => setDueTime(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/85 focus:ring-1 focus:ring-emerald-500/20 rounded-lg p-3.5 pr-10 text-xs text-white font-mono outline-none transition-all duration-150 h-12 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 font-mono">
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  id="reminder-input-notes"
                  placeholder="Masukkan info tambahan seperti no Virtual Account, no rekening tujuan transfer dsb..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/85 focus:ring-1 focus:ring-emerald-500/20 rounded-lg p-3.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none resize-none font-sans transition-all duration-150"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 font-mono">
                  Status Pembayaran Tagihan
                </label>
                <select
                  id="reminder-select-status"
                  value={isPaidForm ? "paid" : "unpaid"}
                  onChange={(e) => setIsPaidForm(e.target.value === "paid")}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/85 focus:ring-1 focus:ring-emerald-500/20 rounded-lg px-3.5 py-2.5 text-xs text-white uppercase font-mono tracking-wider focus:outline-none transition-all duration-150 h-12 cursor-pointer"
                >
                  <option value="unpaid">🔴 BELUM DIBAYAR</option>
                  <option value="paid">🟢 SUDAH DIBAYAR (Tanpa Catat ke Pengeluaran)</option>
                </select>
                <p className="text-[9px] text-zinc-500 mt-1">
                  * Menandai 'Sudah Dibayar' di form ini HANYA mengubah status tagihan dan TIDAK memasukkannya ke catatan pengeluaran.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 select-none">
                  <input
                    id="reminder-input-repeat"
                    type="checkbox"
                    checked={repeatMonthly}
                    onChange={(e) => {
                      setRepeatMonthly(e.target.checked);
                      if (e.target.checked) setRepeatWeeklyThursday(false);
                    }}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-emerald-500/30 focus:ring-offset-0 cursor-pointer"
                  />
                  <label htmlFor="reminder-input-repeat" className="text-[10.5px] font-bold text-zinc-300 cursor-pointer leading-tight">
                    🔄 Ulangi Tagihan Ini Setiap Bulan (Otomatis Buat Tagihan Baru Bulan Depan Saat Lunas)
                  </label>
                </div>

                <div className="flex items-center gap-2.5 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 select-none">
                  <input
                    id="reminder-input-repeat-kamis"
                    type="checkbox"
                    checked={repeatWeeklyThursday}
                    onChange={(e) => {
                      setRepeatWeeklyThursday(e.target.checked);
                      if (e.target.checked) setRepeatMonthly(false);
                    }}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-emerald-500/30 focus:ring-offset-0 cursor-pointer"
                  />
                  <label htmlFor="reminder-input-repeat-kamis" className="text-[10.5px] font-bold text-zinc-300 cursor-pointer leading-tight">
                    📅 Ulangi Tagihan Ini Setiap Hari Kamis (Gajian Mingguan Karyawan)
                  </label>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-5 border-t border-zinc-800/80">
                <button
                  id="btn-submit-reminder"
                  type="submit"
                  className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black uppercase tracking-widest rounded-lg cursor-pointer duration-150 transition-all active:scale-[0.98] h-12 shadow-md shadow-emerald-500/10"
                >
                  {editingId ? "⚡ PERBARUI TAGIHAN" : "📁 SIMPAN PENGINGAT"}
                </button>
                <button
                  id="btn-cancel-reminder"
                  type="button"
                  onClick={resetForm}
                  className="py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 text-[11px] font-black uppercase rounded-lg cursor-pointer duration-150 transition-all active:scale-[0.98] px-6 h-12"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
