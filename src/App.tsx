import React, { useState, useEffect } from "react";
import damdamLogo from "./assets/images/damdam_laundry_logo_1780907572118.png";
import { MobileFrame } from "./components/MobileFrame";
import { DashboardHome } from "./components/DashboardHome";
import { ExpenseForm } from "./components/ExpenseForm";
import { ExpenseHistory } from "./components/ExpenseHistory";
import { AiAssistant } from "./components/AiAssistant";
import { LaundryDashboard } from "./components/LaundryDashboard";
import { BillReminders } from "./components/BillReminders";
import { showSystemNotification } from "./utils/notifications";
import { LaundryTransactions } from "./components/LaundryTransactions";
import { LaundryReports } from "./components/LaundryReports";
import { BluetoothPrinterModal } from "./components/BluetoothPrinterModal";
import { isPrinterConnected, getConnectedDeviceName } from "./utils/bluetoothPrinter";
import { Expense, CategorySpec, Karyawan, Customer, Service, LaundryTransaction, Parfum, Reminder } from "./types";
import { INITIAL_BUDGET_LIMIT, PREDEFINED_CATEGORIES, SAMPLE_EXPENSES } from "./data";
import { 
  LayoutDashboard, 
  PlusCircle, 
  History, 
  Bot, 
  Smartphone, 
  Printer,
  Copy, 
  Check, 
  Database, 
  LogOut,
  Users,
  FileText,
  Receipt,
  Plus,
  Search,
  User as UserIcon,
  Edit3,
  Trash2,
  X,
  Save,
  AlertTriangle,
  ArrowLeft,
  Pin,
  MoreVertical,
  ArrowUpDown,
  Download,
  Coins,
  ChevronRight,
  MessageSquare,
  Sun,
  Moon
} from "lucide-react";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User 
} from "firebase/auth";
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs, 
  getDoc,
  writeBatch,
  collectionGroup,
  query,
  where,
  deleteField
} from "firebase/firestore";
import { 
  auth, 
  db, 
  googleProvider, 
  handleFirestoreError, 
  OperationType 
} from "./firebase";
import { KaryawanDashboard } from "./components/KaryawanDashboard";
import { OwnerKaryawanPanel } from "./components/OwnerKaryawanPanel";
import { SystemUpdatePopup } from "./components/SystemUpdatePopup";

// Utility helpers for WhatsApp Billing features
const formatTanggalIndoFull = (dateStr?: string, includeDayName: boolean = false): string => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr.replace(" ", "T"));
    if (isNaN(d.getTime())) return dateStr;
    
    const hariIndo = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const bulanIndo = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    
    const dayName = hariIndo[d.getDay()];
    const dateNum = d.getDate();
    const monthName = bulanIndo[d.getMonth()];
    const year = d.getFullYear();
    
    if (includeDayName) {
      return `${dayName}, ${dateNum} ${monthName} ${year}`;
    }
    return `${dateNum} ${monthName} ${year}`;
  } catch (_) {
    return dateStr || "";
  }
};

const getIndoGreeting = (): string => {
  const hr = new Date().getHours();
  if (hr >= 4 && hr < 11) return "pagi";
  if (hr >= 11 && hr < 15) return "siang";
  if (hr >= 15 && hr < 18) return "sore";
  return "malam";
};

const generateWaBillMessage = (
  c: Customer,
  unpaidTransactions: LaundryTransaction[],
  dueDate: string,
  paymentMethod: string,
  notesText: string
): string => {
  const greeting = `Selamat ${getIndoGreeting()} kak ${c.nama.toLowerCase()}`;
  
  const itemsText = unpaidTransactions.map((t, idx) => {
    // calculate remaining due price
    const sisa = t.statusBayar === "Belum Lunas" ? t.totalHarga : Math.max(0, t.totalHarga - (t.dpAmount || 0));
    const tglIndo = formatTanggalIndoFull(t.tanggalMasuk);
    return `   ${idx + 1}. ${tglIndo} jumlah tagihan *${sisa.toLocaleString("id-ID")}*`;
  }).join("\n");
  
  const totalSisa = unpaidTransactions.reduce((acc, t) => {
    if (t.statusBayar === "Belum Lunas") {
      return acc + t.totalHarga;
    } else {
      return acc + Math.max(0, t.totalHarga - (t.dpAmount || 0));
    }
  }, 0);
  
  const limitTgl = formatTanggalIndoFull(dueDate, true);
  
  return `${greeting}\n\n` +
    `Berikut Tagihan Laundry yang belum dibayarkan:\n\n` +
    `Nama : *${c.nama.toLowerCase()}*\n` +
    `Tanggal Masuk dan jumlah tagihan\n` +
    `${itemsText}\n\n` +
    `Jumlah Tagihan : *${totalSisa.toLocaleString("id-ID")}*\n` +
    `Status Pembayaran : *Belum Bayar*\n\n` +
    `Agar dilakukan pembayaran paling lambat *${limitTgl}*. Pembayaran dapat dilakukan melalui *${paymentMethod}*\n\n` +
    `*Note:*\n` +
    `${notesText}\n\n` +
    `Terimakasih atas perhatian dan kerjasamanya 🙏😊`;
};

export default function App() {
  // Theme State (Dark mode by default, support Light mode)
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("damdam_theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("light-theme");
      document.body.classList.remove("dark-theme");
    } else {
      document.body.classList.add("dark-theme");
      document.body.classList.remove("light-theme");
    }
    localStorage.setItem("damdam_theme", theme);
  }, [theme]);

  // Authentication & Sync State Indicators
  const [user, setUser] = useState<User | null>(null);
  const [loggedInAdmin, setLoggedInAdmin] = useState<{ id: string; nama: string; username: string; ownerId: string } | null>(() => {
    const saved = localStorage.getItem("damdam_logged_admin");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        console.error(err);
      }
    }
    return null;
  });
  const [loggedInOwner, setLoggedInOwner] = useState<{ uid: string; displayName: string; email: string } | null>(() => {
    const saved = localStorage.getItem("damdam_logged_owner_manual");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        console.error(err);
      }
    }
    return null;
  });
  const [loggedInKaryawan, setLoggedInKaryawan] = useState<Karyawan | null>(() => {
    const saved = localStorage.getItem("damdam_logged_karyawan");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        console.error(err);
      }
    }
    return null;
  });
  const [isGuestSession, setIsGuestSession] = useState<boolean>(() => {
    return localStorage.getItem("damdam_is_guest") === "true";
  });
  const currentOwnerId = loggedInKaryawan 
    ? (loggedInKaryawan as any).ownerId 
    : (loggedInAdmin 
        ? loggedInAdmin.ownerId 
        : (loggedInOwner 
            ? loggedInOwner.uid 
            : (user ? user.uid : (isGuestSession ? "guest" : null))));
  
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Global States (Defaulting to basic or empty lists, populated by sync/localStorage)
  const [reminders, setReminders] = useState<Reminder[]>([]);

  // Root level automatic reminder checker that triggers notifications globally in the app
  useEffect(() => {
    const checkReminders = () => {
      // Check if permission is granted dynamically on each check tick
      let permission = "default";
      try {
        if (typeof window !== "undefined" && "Notification" in window) {
          permission = Notification.permission;
        }
      } catch (e) {
        console.warn("Notification permission API not available:", e);
      }

      if (permission !== "granted") {
        return;
      }

      const safeRemList = Array.isArray(reminders) ? reminders : [];
      if (safeRemList.length === 0) {
        return;
      }

      const now = new Date();
      const localTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const currentHour = String(now.getHours()).padStart(2, "0");
      const currentMinute = String(now.getMinutes()).padStart(2, "0");
      const currentTimeStr = `${currentHour}:${currentMinute}`;

      // Filter unpaid reminders that are due today or overdue
      const unpaidDueOrOverdue = safeRemList.filter(r => {
        if (!r || r.isPaid || !r.dueDate) return false;

        // Overdue from a previous day
        if (r.dueDate < localTodayStr) {
          return true;
        }

        // Due today -> check dueTime
        if (r.dueDate === localTodayStr) {
          if (r.dueTime) {
            return currentTimeStr >= r.dueTime;
          }
          return true;
        }

        return false;
      });

      // Filter those that have not been notified yet today at their specified dueTime
      const unnotified = unpaidDueOrOverdue.filter(r => {
        const flagKey = `damdam_notified_${r.id}_${localTodayStr}_${r.dueTime || "any"}`;
        return !localStorage.getItem(flagKey);
      });

      if (unnotified.length > 0) {
        try {
          if (unnotified.length === 1) {
            const r = unnotified[0];
            const amtVal = r?.amount !== undefined && r?.amount !== null ? r.amount : 0;
            const formattedAmt = (typeof amtVal === "number" ? amtVal : Number(amtVal) || 0).toLocaleString("id-ID");
            const isOverdue = r.dueDate < localTodayStr;
            const titleMsg = isOverdue ? "⚠️ TAGIHAN TERLAMBAT!" : "🚨 JATUH TEMPO SEKARANG!";
            const timeInfo = r.dueTime ? ` (Pukul ${r.dueTime})` : "";

            // Lock this notification key to true immediately BEFORE calling async notification trigger to prevent race condition
            const flagKey = `damdam_notified_${r.id}_${localTodayStr}_${r.dueTime || "any"}`;
            localStorage.setItem(flagKey, "true");

            showSystemNotification(titleMsg, {
              body: `DAMDAM Laundry: "${r.title}" senilai Rp ${formattedAmt}${timeInfo} ${isOverdue ? 'sudah lewat jatuh tempo' : 'jatuh tempo hari ini'}! Harap segera diselesaikan.`,
              requireInteraction: true
            });

            if (navigator.vibrate) {
              navigator.vibrate([200, 100, 200]);
            }
          } else {
            const totalAmount = unnotified.reduce((sum, r) => {
              const amtVal = r?.amount !== undefined && r?.amount !== null ? r.amount : 0;
              return sum + (typeof amtVal === "number" ? amtVal : Number(amtVal) || 0);
            }, 0);

            // Lock all these keys before starting the notification block
            unnotified.forEach(r => {
              const flagKey = `damdam_notified_${r.id}_${localTodayStr}_${r.dueTime || "any"}`;
              localStorage.setItem(flagKey, "true");
            });

            showSystemNotification("🚨 PENGINGAT TAGIHAN PENTING", {
              body: `DAMDAM Laundry: Ada ${unnotified.length} tagihan jatuh tempo/terlambat senilai total Rp ${totalAmount.toLocaleString("id-ID")} yang belum dilunasi.`,
              requireInteraction: true
            });

            if (navigator.vibrate) {
              navigator.vibrate([200, 100, 200]);
            }
          }
        } catch (e) {
          console.error("Gagal memicu root auto-notification:", e);
        }
      }
    };

    // Run custom checker immediately on mount/data change
    checkReminders();

    // Setup periodic polling interval of 5 seconds to guarantee ultra-timely execution across all tabs
    const intervalId = setInterval(checkReminders, 5000);

    return () => clearInterval(intervalId);
  }, [reminders]);

  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Laundry POS States
  const [transactions, setTransactions] = useState<LaundryTransaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [karyawans, setKaryawans] = useState<Karyawan[]>([]);
  const [parfums, setParfums] = useState<Parfum[]>(() => {
    const saved = localStorage.getItem("damdam_parfums");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (err) {
        console.error("Gagal parse damdam_parfums:", err);
      }
    }
    const DEFAULT_PARFUM_NAMES = [
      "Lavender Sensation", 
      "Sakura Blossom", 
      "Lily Fresh", 
      "Lemon Citrus", 
      "Molto Gold", 
      "Ocean Fresh", 
      "Maura",
      "Dianamist",
      "Lovely",
      "Polos (Tanpa Parfum)"
    ];
    return DEFAULT_PARFUM_NAMES.map((nama, idx) => ({
      id: `PFM-INIT-${idx + 1}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      nama,
      userId: "guest",
      createdAt: new Date(1710000000000 + idx * 1000).toISOString()
    }));
  });
  const [isCreatingParfum, setIsCreatingParfum] = useState<boolean>(false);
  const [newParfumName, setNewParfumName] = useState<string>("");
  const [editingParfumId, setEditingParfumId] = useState<string | null>(null);
  const [editingParfumName, setEditingParfumName] = useState<string>("");
  const [dashboardSubTab, setDashboardSubTab] = useState<string>("home");
  const [expensePanelTab, setExpensePanelTab] = useState<string>("ringkasan");

  // Customer Edit/Delete States
  const [selectedCustomerForEdit, setSelectedCustomerForEdit] = useState<Customer | null>(null);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState<boolean>(false);
  const [editCustomerName, setEditCustomerName] = useState<string>("");
  const [editCustomerPhone, setEditCustomerPhone] = useState<string>("");
  const [editCustomerAddress, setEditCustomerAddress] = useState<string>("");
  const [editCustomerParfum, setEditCustomerParfum] = useState<string>("");
  
  // Customer Profile & Deposit Wallet Details states
  const [selectedCustomerProfile, setSelectedCustomerProfile] = useState<Customer | null>(null);
  const [showCustomerProfileModal, setShowCustomerProfileModal] = useState<boolean>(false);
  const [topupAmount, setTopupAmount] = useState<string>("");
  const [selectedPastTrxInProfile, setSelectedPastTrxInProfile] = useState<LaundryTransaction | null>(null);
  const [profileShowUnpaid, setProfileShowUnpaid] = useState<boolean>(false);
  const [profileShowAll, setProfileShowAll] = useState<boolean>(false);
  
  // Direct triggers for fast operations
  const [directOpenCreateTrx, setDirectOpenCreateTrx] = useState<boolean>(false);
  const [directOpenCreateCust, setDirectOpenCreateCust] = useState<boolean>(false);
  const [directOpenCreateServ, setDirectOpenCreateServ] = useState<boolean>(false);

  // Service Subtab CRUD state
  const [searchCustomerQuery, setSearchCustomerQuery] = useState<string>("");
  const [searchServiceQuery, setSearchServiceQuery] = useState<string>("");
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isCreatingServiceInSubtab, setIsCreatingServiceInSubtab] = useState<boolean>(false);

  // Service form states (shared/controlled for both Add and Edit inside the subtab)
  const [subtrackServName, setSubtrackServName] = useState<string>("");
  const [subtrackServType, setSubtrackServType] = useState<string>("Kiloan");
  const [subtrackServPrice, setSubtrackServPrice] = useState<number>(0);
  const [subtrackServDurationValue, setSubtrackServDurationValue] = useState<number>(24);
  const [subtrackServDurationTipe, setSubtrackServDurationTipe] = useState<"Jam" | "Hari">("Hari");
  const [subtrackServProses, setSubtrackServProses] = useState<string[]>(["Cuci", "Pengeringan"]);
  const [subtrackServMinQty, setSubtrackServMinQty] = useState<number>(1);
  const [subtrackServCategory, setSubtrackServCategory] = useState<string>("Kiloan");
  const [subtrackServSematkan, setSubtrackServSematkan] = useState<boolean>(false);

  // New states for the revamped design
  const [serviceSubSubTab, setServiceSubSubTab] = useState<"layanan" | "kategori" | "parfum">("layanan");
  const [initialExpenseSearchTerm, setInitialExpenseSearchTerm] = useState<string>("");
  const [initialExpenseDate, setInitialExpenseDate] = useState<string>("");
  const [highlightExpenseId, setHighlightExpenseId] = useState<string>("");

  const handleNavigateToData = (type: string, id: string) => {
    if (type === "trx") {
      setTrxDateFilter("");
      setTrxSpecialFilter("");
      setTrxSelectedDetailTrxId(id);
      setActiveTab("transaksi");
    } else if (type === "customer") {
      setSearchCustomerQuery(id);
      setActiveTab("dashboard");
      setDashboardSubTab("pelanggan");
    } else if (type === "expense") {
      setHighlightExpenseId(id);
      const matchExp = expenses.find(e => e.id === id);
      if (matchExp) {
        setInitialExpenseSearchTerm(matchExp.title);
      } else {
        setInitialExpenseSearchTerm("");
      }
      setActiveTab("dashboard");
      setDashboardSubTab("pengeluaran");
      setExpensePanelTab("riwayat");
    } else if (type === "service") {
      setSearchServiceQuery("");
      setActiveTab("dashboard");
      setDashboardSubTab("layanan");
      setServiceSubSubTab("layanan");
    }
  };
  const [selectedCategoryChip, setSelectedCategoryChip] = useState<string>("Semua");
  const [serviceSort, setServiceSort] = useState<'nama-asc' | 'harga-asc' | 'harga-desc'>('nama-asc');
  const [selectedServiceForAction, setSelectedServiceForAction] = useState<Service | null>(null);
  const [showServiceActionBottomSheet, setShowServiceActionBottomSheet] = useState<boolean>(false);
  const [customServiceCategories, setCustomServiceCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem("damdam_service_categories");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return ["Express", "Reguler", "Kilat", "Tanpa Kategori"];
  });

  useEffect(() => {
    localStorage.setItem("damdam_service_categories", JSON.stringify(customServiceCategories));
  }, [customServiceCategories]);
  const [newServiceCategoryInput, setNewServiceCategoryInput] = useState<string>("");
  const [editingServiceCategoryIndex, setEditingServiceCategoryIndex] = useState<number | null>(null);
  const [editingServiceCategoryValue, setEditingServiceCategoryValue] = useState<string>("");
  const [showGeneralServiceBottomSheet, setShowGeneralServiceBottomSheet] = useState<boolean>(false);

  const [useManualOwnerLogin, setUseManualOwnerLogin] = useState<boolean>(false);
  const [registeredOwners, setRegisteredOwners] = useState<{ uid: string; displayName: string; email: string }[]>([]);
  const [loadingOwners, setLoadingOwners] = useState<boolean>(false);
  const [manualOwnerSelectedUid, setManualOwnerSelectedUid] = useState<string>("");
  const [customManualUid, setCustomManualUid] = useState<string>("");

  useEffect(() => {
    const fetchOwners = async () => {
      setLoadingOwners(true);
      try {
        const snap = await getDocs(collection(db, "users"));
        const list: { uid: string; displayName: string; email: string }[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data.uid) {
            list.push({
              uid: data.uid,
              displayName: data.displayName || data.email || "Unknown Owner",
              email: data.email || ""
            });
          }
        });
        setRegisteredOwners(list);
        if (list.length > 0) {
          setManualOwnerSelectedUid(list[0].uid);
        }
      } catch (e) {
        console.error("Failed to fetch registered owners on startup:", e);
      } finally {
        setLoadingOwners(false);
      }
    };
    fetchOwners();
  }, [user]);

  const fetchRegisteredOwners = async () => {
    setLoadingOwners(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const list: { uid: string; displayName: string; email: string }[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.uid) {
          list.push({
            uid: data.uid,
            displayName: data.displayName || data.email || "Unknown Owner",
            email: data.email || ""
          });
        }
      });
      setRegisteredOwners(list);
      if (list.length > 0 && !manualOwnerSelectedUid) {
        setManualOwnerSelectedUid(list[0].uid);
      }
    } catch (e) {
      console.error("Failed to fetch registered owners manually:", e);
    } finally {
      setLoadingOwners(false);
    }
  };

  // Load offline local storage laundry states for guests
  useEffect(() => {
    if (!user && !loggedInOwner && !loggedInAdmin) {
      const savedTrx = localStorage.getItem("damdam_transactions");
      if (savedTrx) {
        try { setTransactions(JSON.parse(savedTrx)); } catch(e) { console.error(e); }
      } else {
        const defaultTrx: LaundryTransaction[] = [
          {
            id: "TRX-101",
            customerName: "Mas Bagus",
            customerPhone: "08123456789",
            layananId: "serv-reg",
            layananNama: "Cuci Setrika Reguler",
            parfum: "Lavender",
            berat: 5,
            totalHarga: 35000,
            status: "Proses",
            statusBayar: "Belum Lunas",
            pembayaranMetode: "Tunai",
            tanggalMasuk: new Date(Date.now() - 3600000 * 4).toISOString().replace("T", " ").substring(0, 16),
            estimasiSelesai: new Date(Date.now() + 3600000 * 44).toISOString().replace("T", " ").substring(0, 16),
            userId: "guest"
          },
          {
            id: "TRX-102",
            customerName: "Ibu Laili",
            customerPhone: "08567891234",
            layananId: "serv-exp",
            layananNama: "Cuci Setrika Express",
            parfum: "Sakura",
            berat: 2,
            totalHarga: 22000,
            status: "Antrian",
            statusBayar: "Belum Lunas",
            pembayaranMetode: "QRIS",
            tanggalMasuk: new Date(Date.now() - 3600000 * 2).toISOString().replace("T", " ").substring(0, 16),
            estimasiSelesai: new Date(Date.now() + 3600000 * 22).toISOString().replace("T", " ").substring(0, 16),
            userId: "guest"
          },
          {
            id: "TRX-103",
            customerName: "Mbak Fitri",
            customerPhone: "08987654321",
            layananId: "serv-bed",
            layananNama: "Cuci Bedcover Besar",
            parfum: "Lily",
            berat: 1,
            totalHarga: 25000,
            status: "Selesai",
            statusBayar: "Lunas",
            pembayaranMetode: "Transfer",
            tanggalMasuk: new Date(Date.now() - 3600000 * 24).toISOString().replace("T", " ").substring(0, 16),
            estimasiSelesai: new Date(Date.now() - 3600000 * 2).toISOString().replace("T", " ").substring(0, 16),
            tanggalSelesai: new Date(Date.now() - 3600000 * 3).toISOString().replace("T", " ").substring(0, 16),
            userId: "guest"
          }
        ];
        setTransactions(defaultTrx);
        localStorage.setItem("damdam_transactions", JSON.stringify(defaultTrx));
      }
    }
  }, [user, loggedInOwner, loggedInAdmin]);

  useEffect(() => {
    if (!user && !loggedInOwner && !loggedInAdmin) {
      const savedCust = localStorage.getItem("damdam_customers");
      if (savedCust) {
        try { setCustomers(JSON.parse(savedCust)); } catch(e) { console.error(e); }
      } else {
        const defaultCust: Customer[] = [
          { id: "CUST-001", nama: "Mas Bagus", telepon: "08123456789", alamat: "Sleman, Yogyakarta", userId: "guest", createdAt: new Date().toISOString() },
          { id: "CUST-002", nama: "Ibu Laili", telepon: "08567891234", alamat: "Depok, Sleman", userId: "guest", createdAt: new Date().toISOString() },
          { id: "CUST-003", nama: "Mbak Fitri", telepon: "08987654321", alamat: "Gejayan, Sleman", userId: "guest", createdAt: new Date().toISOString() }
        ];
        setCustomers(defaultCust);
        localStorage.setItem("damdam_customers", JSON.stringify(defaultCust));
      }
    }
  }, [user, loggedInOwner, loggedInAdmin]);

  useEffect(() => {
    if (!user && !loggedInOwner && !loggedInAdmin) {
      const savedServ = localStorage.getItem("damdam_services");
      if (savedServ) {
        try { setServices(JSON.parse(savedServ)); } catch(e) { console.error(e); }
      } else {
        const defaultServ: Service[] = [
          { id: "serv-bed-jumbo", nama: "1 Set Bed Cover Tebal Jumbo", tipe: "Satuan", harga: 70000, durasiJam: 72, proses: ["Cuci", "Pengeringan"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: "guest" },
          { id: "serv-kaos-ab", nama: "1 Set Kaos Atas Bawah", tipe: "Satuan", harga: 25000, durasiJam: 4, proses: ["Cuci", "Pengeringan", "Setrika"], minimalKuantitas: 1, kategori: "Express", sematkan: true, userId: "guest" },
          { id: "serv-mukena", nama: "1 Set Mukena", tipe: "Satuan", harga: 10000, durasiJam: 48, proses: ["Cuci", "Pengeringan", "Setrika"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: "guest" },
          { id: "serv-seprei-besar", nama: "1 Set Seprei Besar", tipe: "Satuan", harga: 25500, durasiJam: 72, proses: ["Cuci", "Pengeringan", "Setrika"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: "guest" },
          { id: "serv-bed-seprei", nama: "1 Set Seprei Besar Dan Bed Cover Besar", tipe: "Satuan", harga: 50000, durasiJam: 72, proses: ["Cuci", "Pengeringan"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: "guest" },
          { id: "serv-reg", nama: "Cuci Setrika Reguler", tipe: "Kiloan", harga: 7000, durasiJam: 48, proses: ["Cuci", "Setrika"], minimalKuantitas: 1, kategori: "Reguler", sematkan: false, userId: "guest" },
          { id: "serv-exp", nama: "Cuci Setrika Express", tipe: "Kiloan", harga: 11000, durasiJam: 24, proses: ["Cuci", "Setrika"], minimalKuantitas: 1, kategori: "Express", sematkan: false, userId: "guest" }
        ];
        setServices(defaultServ);
        localStorage.setItem("damdam_services", JSON.stringify(defaultServ));
      }
    }
  }, [user, loggedInOwner, loggedInAdmin]);

  // Sync back to local offline storage when in guest mode
  useEffect(() => {
    if (!user && !loggedInOwner && !loggedInAdmin && transactions.length > 0) {
      localStorage.setItem("damdam_transactions", JSON.stringify(transactions));
    }
  }, [transactions, user, loggedInOwner, loggedInAdmin]);

  useEffect(() => {
    if (!user && !loggedInOwner && !loggedInAdmin && customers.length > 0) {
      localStorage.setItem("damdam_customers", JSON.stringify(customers));
    }
  }, [customers, user, loggedInOwner, loggedInAdmin]);

  useEffect(() => {
    if (!user && !loggedInOwner && !loggedInAdmin && services.length > 0) {
      localStorage.setItem("damdam_services", JSON.stringify(services));
    }
  }, [services, user, loggedInOwner, loggedInAdmin]);

  useEffect(() => {
    if (!user && !loggedInOwner && !loggedInAdmin && parfums.length > 0) {
      localStorage.setItem("damdam_parfums", JSON.stringify(parfums));
    }
  }, [parfums, user, loggedInOwner, loggedInAdmin]);



  const [categories, setCategories] = useState<Record<string, CategorySpec>>(() => {
    const saved = localStorage.getItem("laundrosave_categories_clean_v2");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        console.error(err);
      }
    }
    return {
      "Lain-lain": {
        name: "Lain-lain",
        color: "#a1a1aa",
        bgColor: "bg-[#18181b] text-[#e4e4e7] border-[#27272a]",
        icon: "Coins"
      }
    };
  });

  const [budgetLimit, setBudgetLimit] = useState<number>(() => {
    const saved = localStorage.getItem("laundrosave_budget_limit");
    if (saved) {
      const parsed = Number(saved);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return INITIAL_BUDGET_LIMIT;
  });

  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [previousTab, setPreviousTab] = useState<string>("dashboard");
  const [trxDateFilter, setTrxDateFilter] = useState<string>("");
  const [trxSpecialFilter, setTrxSpecialFilter] = useState<"dueToday" | "overdue" | "lunasBulanIni" | "dpBulanIni" | "paketBulanIni" | "semuaHutang" | "dpHutang" | "belumLunasHutang" | "">("");
  const [trxSelectedDetailTrxId, setTrxSelectedDetailTrxId] = useState<string | null>(null);

  const [portalTab, setPortalTab] = useState<"owner" | "admin" | "karyawan">("owner");
  const [loginId, setLoginId] = useState<string>("");
  const [loginUser, setLoginUser] = useState<string>("");
  const [loginPass, setLoginPass] = useState<string>("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  const [showMobileModal, setShowMobileModal] = useState<boolean>(false);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState<boolean>(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const triggerPwaInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`PWA Installation outcome: ${outcome}`);
      setDeferredPrompt(null);
      setIsInstallable(false);
    } else {
      setShowInstallGuide(true);
    }
  };

  const [showWaBillModal, setShowWaBillModal] = useState<boolean>(false);
  const [waBillDueDate, setWaBillDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split("T")[0];
  });
  const [waBillPaymentMethod, setWaBillPaymentMethod] = useState<string>("QRIS");
  const [waBillNotes, setWaBillNotes] = useState<string>("Mohon konfirmasi jika sudah melakukan pembayaran");
  const [customWaText, setCustomWaText] = useState<string>("");
  const [isManuallyEdited, setIsManuallyEdited] = useState<boolean>(false);

  useEffect(() => {
    if (!isManuallyEdited && showWaBillModal && selectedCustomerProfile) {
      // Find unpaid/DP transactions for this customer
      const customerTransactions = transactions.filter(t => 
        (t.customerName === selectedCustomerProfile.nama || t.customerPhone === selectedCustomerProfile.telepon)
      );
      const unpaidTransactions = customerTransactions.filter(t => 
        (t.statusBayar === "Belum Lunas" || t.statusBayar === "DP") && t.status !== "Batal"
      );
      
      const compiled = generateWaBillMessage(
        selectedCustomerProfile,
        unpaidTransactions,
        waBillDueDate,
        waBillPaymentMethod,
        waBillNotes
      );
      setCustomWaText(compiled);
    }
  }, [waBillDueDate, waBillPaymentMethod, waBillNotes, showWaBillModal, selectedCustomerProfile, transactions, isManuallyEdited]);

  const [showPrinterModal, setShowPrinterModal] = useState<boolean>(false);
  const [headerPrinterConnected, setHeaderPrinterConnected] = useState<boolean>(isPrinterConnected());
  const [headerPrinterDeviceName, setHeaderPrinterDeviceName] = useState<string | null>(getConnectedDeviceName());

  useEffect(() => {
    const interval = setInterval(() => {
      setHeaderPrinterConnected(isPrinterConnected());
      setHeaderPrinterDeviceName(getConnectedDeviceName());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const [copied, setCopied] = useState<boolean>(false);

  const sharedUrl = typeof window !== "undefined" ? window.location.origin : "https://ais-pre-mfr6gcnozkkr6qfe74ezht-273896989252.asia-southeast1.run.app";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(sharedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Custom dialog confirmation state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    isDangerous?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {}
  });

  const triggerConfirm = (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    isDangerous: boolean = false,
    confirmText: string = "YA, PROSES",
    cancelText: string = "BATAL"
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: async () => {
        await onConfirm();
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
      isDangerous,
      confirmText,
      cancelText
    });
  };

  // Auth observer and initial data sync
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        setIsSyncing(true);
        setSyncError(null);
        try {
          // Save user record to users/{userId} so that the document physically exists in Firestore
          const userPath = `users/${currentUser.uid}`;
          try {
            await setDoc(doc(db, "users", currentUser.uid), {
              uid: currentUser.uid,
              email: currentUser.email || "",
              displayName: currentUser.displayName || "",
              photoURL: currentUser.photoURL || "",
              lastActive: new Date().toISOString()
            }, { merge: true });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, userPath);
          }

          // Check if remote data exists
          const expenseCol = collection(db, "users", currentUser.uid, "expenses");
          const catCol = collection(db, "users", currentUser.uid, "categories");

          const expenseSnap = await getDocs(expenseCol);
          const catSnap = await getDocs(catCol);

          // Highly resilient granular cloud migration:
          // Sync each collection separately if they don't have records in Firestore yet.
          const batch = writeBatch(db);
          let writeCount = 0;

          if (catSnap.empty) {
            // Fetch local categories (from state/localStorage) or defaults
            const localCats = Object.keys(categories).length > 0 ? categories : PREDEFINED_CATEGORIES;
            for (const [key, val] of Object.entries(localCats)) {
              const catRef = doc(db, "users", currentUser.uid, "categories", key);
              const valSpec = val as CategorySpec;
              batch.set(catRef, {
                name: valSpec.name || key,
                color: valSpec.color || "#10b981",
                bgColor: valSpec.bgColor || "bg-[#062419] text-[#10b981] border-[#10b981]/30",
                icon: valSpec.icon || "Tag",
                userId: currentUser.uid
              });
              writeCount++;
            }
          }

          if (expenseSnap.empty) {
            // Fetch local expenses in memory
            const localSavedExp = localStorage.getItem("laundrosave_expenses_clean_v2");
            const localExpensesArray: Expense[] = localSavedExp ? JSON.parse(localSavedExp) : [];
            const uploadList = localExpensesArray.length > 0 ? localExpensesArray : expenses;

            for (const exp of uploadList) {
              const expRef = doc(db, "users", currentUser.uid, "expenses", exp.id);
              batch.set(expRef, {
                id: exp.id,
                title: exp.title,
                amount: typeof exp.amount === "number" ? exp.amount : 0,
                category: exp.category,
                date: exp.date,
                paymentMethod: exp.paymentMethod,
                notes: exp.notes || "",
                userId: currentUser.uid
              });
              writeCount++;
            }
          }

          // Sync Reminders to Firestore if remote is empty
          try {
            const remindersCol = collection(db, "users", currentUser.uid, "reminders");
            const remindersSnap = await getDocs(remindersCol);

            if (remindersSnap.empty) {
              const localSavedRem = localStorage.getItem("damdam_reminders");
              const localRemArray: Reminder[] = localSavedRem ? JSON.parse(localSavedRem) : [];
              const uploadRemList = localRemArray.length > 0 ? localRemArray : reminders;

              for (const rem of uploadRemList) {
                const remRef = doc(db, "users", currentUser.uid, "reminders", rem.id);
                const cleaned: Record<string, any> = {};
                for (const [k, v] of Object.entries(rem)) {
                  if (v !== undefined && v !== null) {
                    cleaned[k] = v;
                  }
                }
                batch.set(remRef, {
                  ...cleaned,
                  userId: currentUser.uid
                });
                writeCount++;
              }
            }
          } catch (e) {
            console.warn("Ignored reminders check error during login migration", e);
          }

          // Verify if settings document is present
          try {
            const settingsCol = collection(db, "users", currentUser.uid, "settings");
            const settingsSnap = await getDocs(settingsCol);
            if (settingsSnap.empty) {
              const budgetRef = doc(db, "users", currentUser.uid, "settings", "budget");
              batch.set(budgetRef, { limit: budgetLimit });
              writeCount++;
            }
          } catch (e) {
            console.warn("Ignored budget check error", e);
          }

          if (writeCount > 0) {
            await batch.commit();
          }

          // Initial check for remote laundry services, customers, and transactions
          try {
            const trCol = collection(db, "users", currentUser.uid, "transactions");
            const cuCol = collection(db, "users", currentUser.uid, "customers");
            const seCol = collection(db, "users", currentUser.uid, "services");

            const trSnap = await getDocs(trCol);
            const cuSnap = await getDocs(cuCol);
            const seSnap = await getDocs(seCol);

            const lBatch = writeBatch(db);
            let laundryWrites = 0;

            if (seSnap.empty) {
              const defaultServ = [
                { id: "serv-bed-jumbo", nama: "1 Set Bed Cover Tebal Jumbo", tipe: "Satuan", harga: 70000, durasiJam: 72, proses: ["Cuci", "Pengeringan"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: currentUser.uid },
                { id: "serv-kaos-ab", nama: "1 Set Kaos Atas Bawah", tipe: "Satuan", harga: 25000, durasiJam: 4, proses: ["Cuci", "Pengeringan", "Setrika"], minimalKuantitas: 1, kategori: "Express", sematkan: true, userId: currentUser.uid },
                { id: "serv-mukena", nama: "1 Set Mukena", tipe: "Satuan", harga: 10000, durasiJam: 48, proses: ["Cuci", "Pengeringan", "Setrika"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: currentUser.uid },
                { id: "serv-seprei-besar", nama: "1 Set Seprei Besar", tipe: "Satuan", harga: 25500, durasiJam: 72, proses: ["Cuci", "Pengeringan", "Setrika"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: currentUser.uid },
                { id: "serv-bed-seprei", nama: "1 Set Seprei Besar Dan Bed Cover Besar", tipe: "Satuan", harga: 50000, durasiJam: 72, proses: ["Cuci", "Pengeringan"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: currentUser.uid },
                { id: "serv-reg", nama: "Cuci Setrika Reguler", tipe: "Kiloan", harga: 7000, durasiJam: 48, proses: ["Cuci", "Setrika"], minimalKuantitas: 1, kategori: "Reguler", sematkan: false, userId: currentUser.uid },
                { id: "serv-exp", nama: "Cuci Setrika Express", tipe: "Kiloan", harga: 11000, durasiJam: 24, proses: ["Cuci", "Setrika"], minimalKuantitas: 1, kategori: "Express", sematkan: false, userId: currentUser.uid }
              ];
              for (const s of defaultServ) {
                lBatch.set(doc(db, "users", currentUser.uid, "services", s.id), s);
                laundryWrites++;
              }
            }

            if (cuSnap.empty) {
              const defaultCust = [
                { id: "CUST-001", nama: "Mas Bagus", telepon: "08123456789", alamat: "Sleman, Yogyakarta", userId: currentUser.uid, createdAt: new Date().toISOString() },
                { id: "CUST-002", nama: "Ibu Laili", telepon: "08567891234", alamat: "Depok, Sleman", userId: currentUser.uid, createdAt: new Date().toISOString() }
              ];
              for (const c of defaultCust) {
                lBatch.set(doc(db, "users", currentUser.uid, "customers", c.id), c);
                laundryWrites++;
              }
            }

            if (trSnap.empty) {
              const defaultTrx = [
                {
                  id: "TRX-101",
                  customerName: "Mas Bagus",
                  customerPhone: "08123456789",
                  layananId: "serv-reg",
                  layananNama: "Cuci Setrika Reguler",
                  parfum: "Lavender",
                  berat: 5,
                  totalHarga: 35000,
                  status: "Proses",
                  statusBayar: "Belum Lunas",
                  pembayaranMetode: "Tunai",
                  tanggalMasuk: new Date(Date.now() - 3600000 * 4).toISOString().replace("T", " ").substring(0, 16),
                  estimasiSelesai: new Date(Date.now() + 3600000 * 44).toISOString().replace("T", " ").substring(0, 16),
                  userId: currentUser.uid
                }
              ];
              for (const t of defaultTrx) {
                lBatch.set(doc(db, "users", currentUser.uid, "transactions", t.id), t);
                laundryWrites++;
              }
            }

            if (laundryWrites > 0) {
              await lBatch.commit();
            }
          } catch (e) {
            console.warn("Ignored default laundry data initialization error", e);
          }
        } catch (error) {
          console.error("Cloud data initialization sync failure:", error);
          setSyncError(error instanceof Error ? error.message : String(error));
        } finally {
          setIsSyncing(false);
        }
      } else {
        // If logged out / guest Mode: load from local storage
        const savedAdmin = localStorage.getItem("damdam_logged_admin");
        if (!savedAdmin) {
          const savedExpenses = localStorage.getItem("laundrosave_expenses_clean_v2");
          if (savedExpenses) {
            try {
              setExpenses(JSON.parse(savedExpenses));
            } catch (e) {
              console.error(e);
            }
          } else {
            setExpenses([]);
          }
        }
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Real-time listen: Expenses (Active when logged in as Owner or Admin)
  useEffect(() => {
    if (!currentOwnerId) return;

    const path = `users/${currentOwnerId}/expenses`;
    const unsubscribeExpenses = onSnapshot(
      collection(db, "users", currentOwnerId, "expenses"),
      (snapshot) => {
        const list: Expense[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as Expense);
        });
        // Sort descending by date
        list.sort((a, b) => b.date.localeCompare(a.date));
        setExpenses(list);
      },
      (error) => {
        console.error("Firestore listen expenses error:", error);
        setSyncError(`Gagal membaca daftar pengeluaran disk: ${error.message}`);
      }
    );

    return () => unsubscribeExpenses();
  }, [currentOwnerId]);

  // Real-time listen: Reminders (Active for both logged-in and guest profiles)
  useEffect(() => {
    const targetOwnerId = currentOwnerId || "guest";
    const path = `users/${targetOwnerId}/reminders`;
    const unsubscribeReminders = onSnapshot(
      collection(db, "users", targetOwnerId, "reminders"),
      (snapshot) => {
        const list: Reminder[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as Reminder);
        });
        // Sort ascending by due date (soonest first)
        list.sort((a, b) => {
          const valA = a.dueDate || "";
          const valB = b.dueDate || "";
          return valA.localeCompare(valB);
        });
        setReminders(list);
      },
      (error) => {
        console.error("Firestore listen reminders error:", error);
      }
    );

    return () => unsubscribeReminders();
  }, [currentOwnerId]);

  // Real-time listen: Categories (Active when logged in as Owner or Admin)
  useEffect(() => {
    if (!currentOwnerId) return;

    const path = `users/${currentOwnerId}/categories`;
    const unsubscribeCategories = onSnapshot(
      collection(db, "users", currentOwnerId, "categories"),
      (snapshot) => {
        const items: Record<string, CategorySpec> = {};
        snapshot.forEach((d) => {
          const cat = d.data() as CategorySpec;
          items[cat.name] = cat;
        });
        if (Object.keys(items).length > 0) {
          setCategories(items);
        }
      },
      (error) => {
        console.error("Firestore listen categories error:", error);
        setSyncError(`Gagal membaca daftar kategori disk: ${error.message}`);
      }
    );

    return () => unsubscribeCategories();
  }, [currentOwnerId]);

  // Real-time listen: Budget settings doc (Active when logged in as Owner or Admin)
  useEffect(() => {
    if (!currentOwnerId) return;

    const path = `users/${currentOwnerId}/settings/budget`;
    const unsubscribeBudget = onSnapshot(
      doc(db, "users", currentOwnerId, "settings", "budget"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && typeof data.limit === "number") {
            setBudgetLimit(data.limit);
          }
        }
      },
      (error) => {
        console.error("Firestore listen budget error:", error);
        setSyncError(`Gagal membaca budget limit disk: ${error.message}`);
      }
    );

    return () => unsubscribeBudget();
  }, [currentOwnerId]);

  // Real-time listen: Laundry Transactions (Active when logged in as Owner or Admin)
  useEffect(() => {
    if (!currentOwnerId) return;

    const unsubscribeTransactions = onSnapshot(
      collection(db, "users", currentOwnerId, "transactions"),
      (snapshot) => {
        const list: LaundryTransaction[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as LaundryTransaction);
        });
        // Sort descending by tanggalMasuk
        list.sort((a, b) => b.tanggalMasuk.localeCompare(a.tanggalMasuk));
        setTransactions(list);
      },
      (error) => {
        console.error("Firestore listen transactions error:", error);
        setSyncError(`Gagal membaca daftar transaksi laundry disk: ${error.message}`);
      }
    );

    return () => unsubscribeTransactions();
  }, [currentOwnerId]);

  // Real-time listen: Laundry Customers (Active when logged in as Owner or Admin)
  useEffect(() => {
    if (!currentOwnerId) return;

    const unsubscribeCustomers = onSnapshot(
      collection(db, "users", currentOwnerId, "customers"),
      (snapshot) => {
        const list: Customer[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as Customer);
        });
        // Sort descending by createdAt
        list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        setCustomers(list);
      },
      (error) => {
        console.error("Firestore listen customers error:", error);
        setSyncError(`Gagal membaca daftar pelanggan disk: ${error.message}`);
      }
    );

    return () => unsubscribeCustomers();
  }, [currentOwnerId]);

  // Real-time listen: Laundry Services (Active when logged in as Owner or Admin)
  useEffect(() => {
    if (!currentOwnerId) return;

    const unsubscribeServices = onSnapshot(
      collection(db, "users", currentOwnerId, "services"),
      (snapshot) => {
        const list: Service[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as Service);
        });
        setServices(list);
      },
      (error) => {
        console.error("Firestore listen services error:", error);
        setSyncError(`Gagal membaca daftar layanan laundry disk: ${error.message}`);
      }
    );

    return () => unsubscribeServices();
  }, [currentOwnerId]);

  // Real-time listen: Karyawan Staff (Active when logged in as Owner or Admin)
  useEffect(() => {
    if (!currentOwnerId) return;

    const unsubscribeKaryawan = onSnapshot(
      collection(db, "users", currentOwnerId, "karyawan"),
      (snapshot) => {
        const list: Karyawan[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as Karyawan);
        });
        setKaryawans(list);
      },
      (error) => {
        console.error("Firestore listen karyawan error:", error);
      }
    );

    return () => unsubscribeKaryawan();
  }, [currentOwnerId]);

  // Real-time listen: Parfum options (Active when logged in as Owner or Admin or Karyawan)
  useEffect(() => {
    if (!currentOwnerId) return;

    let didAutoSeed = false;

    const unsubscribeParfums = onSnapshot(
      collection(db, "users", currentOwnerId, "parfum"),
      async (snapshot) => {
        const list: Parfum[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as Parfum);
        });
        
        if (snapshot.empty && !didAutoSeed) {
          didAutoSeed = true;
          console.log("Parfum empty in cloud, auto-seeding default perfumes...");
          try {
            const defaults = ["Lavender Sensation", "Sakura Blossom", "Lily Fresh", "Lemon Citrus", "Molto Gold", "Ocean Fresh", "Maura", "Dianamist", "Lovely", "Polos (Tanpa Parfum)"];
            const batch = writeBatch(db);
            defaults.forEach((nama) => {
              const id = "PFM-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
              const pRef = doc(db, "users", currentOwnerId, "parfum", id);
              batch.set(pRef, {
                id,
                nama,
                userId: currentOwnerId,
                createdAt: new Date().toISOString()
              });
            });
            await batch.commit();
          } catch (err) {
            console.error("Gagal auto-seeding default parfum:", err);
          }
        } else {
          list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
          setParfums(list);
          localStorage.setItem("damdam_parfums", JSON.stringify(list));

          // Auto-seed newly requested perfumes (Maura, Dianamist, Lovely) if they are missing
          const missingDefaults = ["Maura", "Dianamist", "Lovely"].filter(
            name => !list.some(p => p.nama.toLowerCase() === name.toLowerCase())
          );
          if (missingDefaults.length > 0 && currentOwnerId) {
            console.log("Auto-seeding missing perfumes to Firestore:", missingDefaults);
            try {
              const batch = writeBatch(db);
              missingDefaults.forEach((nama, idx) => {
                const id = "PFM-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
                const pRef = doc(db, "users", currentOwnerId, "parfum", id);
                batch.set(pRef, {
                  id,
                  nama,
                  userId: currentOwnerId,
                  createdAt: new Date(Date.now() + idx * 1000).toISOString()
                });
              });
              batch.commit().catch(err => console.error("Batch commit failed for missing default perfumes:", err));
            } catch (err) {
              console.error("Gagal auto-seed missing default perfumes:", err);
            }
          }
        }
      },
      (error) => {
        console.error("Firestore listen parfums error:", error);
      }
    );

    return () => unsubscribeParfums();
  }, [currentOwnerId]);

  // Auto-migration to clean up separate category entries (like "Plastik 30", "Plastik 35") and group them under the main "Plastik" category.
  useEffect(() => {
    if (Object.keys(categories).length === 0) return;

    let hasChanges = false;
    const updatedCategories = { ...categories };
    const deletedCategoryKeys: string[] = [];

    // Ensure the main "Plastik" category exists in categories with correct metadata
    if (!updatedCategories["Plastik"]) {
      updatedCategories["Plastik"] = {
        name: "Plastik",
        color: "#d946ef", // fuchsia
        bgColor: "bg-[#2d0a33] text-[#d946ef] border-[#d946ef]/30",
        icon: "Package",
        subCategories: ["Plastik 30", "Plastik 35", "Plastik 40", "Plastik 45", "Plastik 50", "Plastik 60", "Plastik 100", "Plastik 150"]
      };
      hasChanges = true;
    }

    const sizes = ["30", "35", "40", "45", "50", "60", "100", "150"];
    const patternList = sizes.map(s => `plastik ${s}`);

    // If there are separate categories like "Plastik 30", "Plastik 35", remove them from categories list
    Object.keys(updatedCategories).forEach((key) => {
      if (key === "Plastik") return;
      const lowerKey = key.toLowerCase().trim();
      const isRedundantPlastic = patternList.some(p => lowerKey === p) || 
                                 lowerKey.startsWith("plastik ") || 
                                 /plastik\s*\d+/.test(lowerKey);
      if (isRedundantPlastic) {
        delete updatedCategories[key];
        deletedCategoryKeys.push(key);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setCategories(updatedCategories);
      localStorage.setItem("laundrosave_categories_clean_v2", JSON.stringify(updatedCategories));

      if (currentOwnerId) {
        const updateDb = async () => {
          try {
            const batch = writeBatch(db);
            // write/merge "Plastik" main category
            const pRef = doc(db, "users", currentOwnerId, "categories", "Plastik");
            batch.set(pRef, updatedCategories["Plastik"], { merge: true });

            // delete obsolete categories from Firestore
            deletedCategoryKeys.forEach((key) => {
              const obsoleteRef = doc(db, "users", currentOwnerId, "categories", key);
              batch.delete(obsoleteRef);
            });

            await batch.commit();
            console.log("Successfully migrated categories, merged into Plastik.");
          } catch (err) {
            console.error("Failed to migrate categories in Firestore:", err);
          }
        };
        updateDb();
      }
    }
  }, [categories, currentOwnerId]);

  // Auto-migration for expenses to map old categories (like "Plastik 30") to main category "Plastik" with respective subCategory
  useEffect(() => {
    if (expenses.length === 0) return;

    let hasChanges = false;
    const updatedExpenses = expenses.map((exp) => {
      const catTrim = exp.category.trim();
      const catLower = catTrim.toLowerCase();
      
      // If category is some "Plastik XX", change to main category "Plastik" and subCategory "Plastik XX"
      const match = catTrim.match(/^Plastik\s*(\d+)$/i);
      if (match) {
        hasChanges = true;
        const sizeNum = match[1];
        return {
          ...exp,
          category: "Plastik",
          subCategory: `Plastik ${sizeNum}`
        };
      } else if (catLower === "plastik" && !exp.subCategory) {
        return exp;
      }
      return exp;
    });

    if (hasChanges) {
      setExpenses(updatedExpenses);
      if (!user && !loggedInOwner && !loggedInAdmin) {
        localStorage.setItem("laundrosave_expenses_clean_v2", JSON.stringify(updatedExpenses));
      }

      if (currentOwnerId) {
        const updateDb = async () => {
          try {
            const batch = writeBatch(db);
            updatedExpenses.forEach((exp) => {
              const originalExp = expenses.find((e) => e.id === exp.id);
              if (originalExp && (originalExp.category !== exp.category || originalExp.subCategory !== exp.subCategory)) {
                const docRef = doc(db, "users", currentOwnerId, "expenses", exp.id);
                batch.set(docRef, exp, { merge: true });
              }
            });
            await batch.commit();
            console.log("Successfully updated existing plastic expenses to main 'Plastik' category.");
          } catch (err) {
            console.error("Failed to migrate plastic expenses in Firestore:", err);
          }
        };
        updateDb();
      }
    }
  }, [expenses, currentOwnerId, user, loggedInOwner, loggedInAdmin]);

  // Sync back to local offline storage ONLY when user is offline (Guest mode)
  useEffect(() => {
    if (!user && !loggedInOwner && !loggedInAdmin) {
      localStorage.setItem("laundrosave_expenses_clean_v2", JSON.stringify(expenses));
    }
  }, [expenses, user, loggedInOwner, loggedInAdmin]);

  useEffect(() => {
    if (!user && !loggedInOwner && !loggedInAdmin) {
      localStorage.setItem("laundrosave_categories_clean_v2", JSON.stringify(categories));
    }
  }, [categories, user, loggedInOwner, loggedInAdmin]);

  useEffect(() => {
    if (!user && !loggedInOwner && !loggedInAdmin) {
      localStorage.setItem("laundrosave_budget_limit", String(budgetLimit));
    }
  }, [budgetLimit, user, loggedInOwner, loggedInAdmin]);

  // Login handler
  const handleSignIn = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      localStorage.removeItem("damdam_is_guest");
      setIsGuestSession(false);
    } catch (err: any) {
      console.error("Popup authentication failed:", err);
      const errorCode = err?.code || "";
      const errorMessage = err?.message || String(err);
      
      if (errorCode === "auth/unauthorized-domain") {
        setLoginError("unauthorized-domain");
      } else if (errorCode === "auth/popup-blocked") {
        setLoginError("popup-blocked");
      } else if (errorMessage.toLowerCase().includes("unauthorized") || errorMessage.toLowerCase().includes("domain")) {
        setLoginError("unauthorized-domain");
      } else {
        setLoginError(errorMessage);
      }
    }
  };

  const handleKaryawanLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const q = query(
        collectionGroup(db, "karyawan"),
        where("username", "==", loginUser.trim().toLowerCase())
      );
      const snap = await getDocs(q);
      let found: Karyawan & { ownerId?: string } | null = null;

      snap.forEach((d) => {
        const item = d.data() as Karyawan;
        if (item.password === loginPass.trim()) {
          const parentDocRef = d.ref.parent.parent;
          const ownerId = parentDocRef ? parentDocRef.id : "";
          found = { ...item, ownerId };
        }
      });

      if (found) {
        setLoggedInKaryawan(found as Karyawan);
        localStorage.setItem("damdam_logged_karyawan", JSON.stringify(found));
        localStorage.removeItem("damdam_is_guest");
        setIsGuestSession(false);
        setLoginId("");
        setLoginUser("");
        setLoginPass("");
      } else {
        setLoginError("Username atau Password salah!");
      }
    } catch (err) {
      console.error(err);
      setLoginError("Gagal otentikasi. Pastikan koneksi internet aktif.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleKaryawanSignOut = () => {
    setLoggedInKaryawan(null);
    localStorage.removeItem("damdam_logged_karyawan");
    localStorage.removeItem("damdam_is_guest");
    setIsGuestSession(false);
    setActiveTab("dashboard");
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const q = query(
        collectionGroup(db, "admins"),
        where("username", "==", loginUser.trim().toLowerCase())
      );
      const snap = await getDocs(q);
      let found: { id: string; nama: string; username: string; ownerId: string } | null = null;

      snap.forEach((d) => {
        const item = d.data();
        if (item.password === loginPass.trim()) {
          const parentDocRef = d.ref.parent.parent;
          const ownerId = parentDocRef ? parentDocRef.id : "";
          found = {
            id: item.id,
            nama: item.nama,
            username: item.username,
            ownerId
          };
        }
      });

      if (found) {
        setLoggedInAdmin(found);
        localStorage.setItem("damdam_logged_admin", JSON.stringify(found));
        localStorage.removeItem("damdam_is_guest");
        setIsGuestSession(false);
        setLoginId("");
        setLoginUser("");
        setLoginPass("");
      } else {
        setLoginError("Username atau Password Admin salah!");
      }
    } catch (err) {
      console.error(err);
      setLoginError("Gagal otentikasi Admin. Pastikan koneksi internet aktif.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminSignOut = () => {
    setLoggedInAdmin(null);
    localStorage.removeItem("damdam_logged_admin");
    localStorage.removeItem("damdam_is_guest");
    setIsGuestSession(false);
    setActiveTab("dashboard");
  };

  const handleManualOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    const isCredentialsValid = 
      (loginUser.trim().toLowerCase() === "owner" || loginUser.trim().toLowerCase() === "damdam") && 
      (loginPass.trim() === "damdam" || loginPass.trim() === "laundrydam" || loginPass.trim() === "owner123");

    if (!isCredentialsValid) {
      setLoginError("Username atau Password salah! (Gunakan username: owner, password: damdam atau laundrydam)");
      setLoginLoading(false);
      return;
    }

    let finalUid = manualOwnerSelectedUid;
    if (finalUid === "custom_uid") {
      if (!customManualUid.trim()) {
        setLoginError("UID Manual wajib diisi jika memilih opsi ID Kustom.");
        setLoginLoading(false);
        return;
      }
      finalUid = customManualUid.trim();
    }

    if (!finalUid) {
      setLoginError("Silakan pilih Akun Owner yang ingin dimasuki atau masukkan UID manual.");
      setLoginLoading(false);
      return;
    }

    try {
      const selected = registeredOwners.find(o => o.uid === finalUid);
      const emailVal = selected ? selected.email : "manual-owner@damdam.com";
      const nameVal = selected ? selected.displayName : ("Owner Manual (" + finalUid.slice(0, 6) + ")");

      const sessionObj = {
        uid: finalUid,
        displayName: nameVal,
        email: emailVal
      };

      setLoggedInOwner(sessionObj);
      localStorage.setItem("damdam_logged_owner_manual", JSON.stringify(sessionObj));
      localStorage.removeItem("damdam_is_guest");
      setIsGuestSession(false);
      setLoginId("");
      setLoginUser("");
      setLoginPass("");
    } catch (err: any) {
      console.error(err);
      setLoginError("Gagal otentikasi owner manual: " + err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // Sign out helper
  const handleSignOut = () => {
    triggerConfirm(
      "KELUAR SINKRONISASI CLOUD",
      "Apakah Anda yakin ingin keluar dari sinkronisasi database cloud? Anda akan dapat memilih atau berganti Akun Google lain saat masuk kembali.",
      async () => {
        try {
          if (loggedInOwner) {
            setLoggedInOwner(null);
            localStorage.removeItem("damdam_logged_owner_manual");
          } else {
            await signOut(auth);
          }
          setExpenses([]);
          setTransactions([]);
          setCustomers([]);
          setServices([]);
          setDashboardSubTab("home");
          setCategories({
            "Lain-lain": {
              name: "Lain-lain",
              color: "#a1a1aa",
              bgColor: "bg-[#18181b] text-[#e4e4e7] border-[#27272a]",
              icon: "Coins"
            }
          });
          setBudgetLimit(INITIAL_BUDGET_LIMIT);
          localStorage.removeItem("damdam_is_guest");
          setIsGuestSession(false);
        } catch (err) {
          console.error("Sign-out failed:", err);
        }
      },
      true,
      "KELUAR & GANTI AKUN",
      "BATAL"
    );
  };


  // Laundry POS CRUD Handlers
  const handleAddTransaction = async (newTrx: LaundryTransaction) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/transactions/${newTrx.id}`;
      try {
        const cleaned: Record<string, any> = {};
        for (const [key, val] of Object.entries(newTrx)) {
          if (val !== undefined && val !== null) {
            cleaned[key] = val;
          }
        }
        await setDoc(doc(db, "users", currentOwnerId, "transactions", newTrx.id), {
          ...cleaned,
          userId: currentOwnerId
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    } else {
      setTransactions((prev) => [newTrx, ...prev]);
    }
  };

  const handleUpdateTransaction = async (id: string, updates: Partial<LaundryTransaction>) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/transactions/${id}`;
      try {
        const cleaned: Record<string, any> = {};
        for (const [key, val] of Object.entries(updates)) {
          if (val !== undefined && val !== null) {
            cleaned[key] = val;
          }
        }
        await setDoc(doc(db, "users", currentOwnerId, "transactions", id), cleaned, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    } else {
      setTransactions((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/transactions/${id}`;
      try {
        await deleteDoc(doc(db, "users", currentOwnerId, "transactions", id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    } else {
      setTransactions((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleAddCustomer = async (newCust: Customer) => {
    // Optimistic UI update: Instantly update local state so the user sees the new customer immediately
    setCustomers((prev) => [newCust, ...prev.filter(c => c.id !== newCust.id)]);

    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/customers/${newCust.id}`;
      try {
        const cleaned: Record<string, any> = {};
        for (const [key, val] of Object.entries(newCust)) {
          if (val !== undefined && val !== null) {
            cleaned[key] = val;
          }
        }
        await setDoc(doc(db, "users", currentOwnerId, "customers", newCust.id), {
          ...cleaned,
          userId: currentOwnerId
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }
  };

  const handleUpdateCustomer = async (updatedCust: Customer) => {
    setCustomers((prev) => prev.map(c => c.id === updatedCust.id ? updatedCust : c));

    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/customers/${updatedCust.id}`;
      try {
        const cleaned: Record<string, any> = {};
        for (const [key, val] of Object.entries(updatedCust)) {
          if (val !== undefined && val !== null) {
            cleaned[key] = val;
          }
        }
        await setDoc(doc(db, "users", currentOwnerId, "customers", updatedCust.id), {
          ...cleaned,
          userId: currentOwnerId
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    } else {
      localStorage.setItem("damdam_customers", JSON.stringify(customers.map(c => c.id === updatedCust.id ? updatedCust : c)));
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    setCustomers((prev) => prev.filter(c => c.id !== id));

    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/customers/${id}`;
      try {
        await deleteDoc(doc(db, "users", currentOwnerId, "customers", id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    } else {
      localStorage.setItem("damdam_customers", JSON.stringify(customers.filter(c => c.id !== id)));
    }
  };

  const handleAddService = async (newService: Service) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/services/${newService.id}`;
      try {
        const cleaned: Record<string, any> = {};
        for (const [key, val] of Object.entries(newService)) {
          if (val !== undefined && val !== null) {
            cleaned[key] = val;
          }
        }
        await setDoc(doc(db, "users", currentOwnerId, "services", newService.id), {
          ...cleaned,
          userId: currentOwnerId
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    } else {
      setServices((prev) => [newService, ...prev]);
    }
  };

  const handleUpdateService = async (updatedService: Service) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/services/${updatedService.id}`;
      try {
        const cleaned: Record<string, any> = {};
        for (const [key, val] of Object.entries(updatedService)) {
          if (val !== undefined && val !== null) {
            cleaned[key] = val;
          }
        }
        await setDoc(doc(db, "users", currentOwnerId, "services", updatedService.id), {
          ...cleaned,
          userId: currentOwnerId
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    } else {
      setServices((prev) => prev.map(s => s.id === updatedService.id ? updatedService : s));
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/services/${serviceId}`;
      try {
        await deleteDoc(doc(db, "users", currentOwnerId, "services", serviceId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    } else {
      setServices((prev) => prev.filter(s => s.id !== serviceId));
    }
  };

  const getLatestOwnerId = (): string | null => {
    if (user && user.uid) return user.uid;
    
    const savedOwner = localStorage.getItem("damdam_logged_owner_manual");
    if (savedOwner) {
      try {
        const parsed = JSON.parse(savedOwner);
        if (parsed && parsed.uid) return parsed.uid;
      } catch (e) {}
    }
    
    const savedAdmin = localStorage.getItem("damdam_logged_admin");
    if (savedAdmin) {
      try {
        const parsed = JSON.parse(savedAdmin);
        if (parsed && parsed.ownerId) return parsed.ownerId;
      } catch (e) {}
    }
    
    const savedKaryawan = localStorage.getItem("damdam_logged_karyawan");
    if (savedKaryawan) {
      try {
        const parsed = JSON.parse(savedKaryawan);
        if (parsed && parsed.ownerId) return parsed.ownerId;
      } catch (e) {}
    }
    
    return null;
  };

  const handleAddParfum = async (nama: string) => {
    if (!nama.trim()) return;
    const cleanNama = nama.trim();
    const activeId = currentOwnerId;
    const id = "PFM-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const newParfum: Parfum = {
      id,
      nama: cleanNama,
      userId: activeId || "guest",
      createdAt: new Date().toISOString()
    };

    // Optimistic update for instant responsiveness
    setParfums((prev) => {
      if (prev.some(p => p.nama.toLowerCase() === cleanNama.toLowerCase())) {
        return prev;
      }
      const updated = [newParfum, ...prev];
      localStorage.setItem("damdam_parfums", JSON.stringify(updated));
      return updated;
    });

    if (activeId) {
      const path = `users/${activeId}/parfum/${id}`;
      try {
        await setDoc(doc(db, "users", activeId, "parfum", id), newParfum);
      } catch (err) {
        console.error("Gagal menyimpan parfum ke database:", err);
        // Revert local state if DB call explicitly fails
        setParfums((prev) => {
          const reverted = prev.filter(p => p.id !== id);
          localStorage.setItem("damdam_parfums", JSON.stringify(reverted));
          return reverted;
        });
        alert("Gagal menambahkan parfum ke database cloud: " + String(err));
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }
  };

  const handleUpdateParfum = async (id: string, nama: string) => {
    if (!nama.trim()) return;
    const cleanNama = nama.trim();
    const activeId = currentOwnerId;

    // Optimistic update
    setParfums((prev) => {
      const updated = prev.map(p => p.id === id ? { ...p, nama: cleanNama } : p);
      localStorage.setItem("damdam_parfums", JSON.stringify(updated));
      return updated;
    });

    if (activeId) {
      const path = `users/${activeId}/parfum/${id}`;
      try {
        await setDoc(doc(db, "users", activeId, "parfum", id), {
          id,
          nama: cleanNama,
          userId: activeId,
          createdAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error("Gagal memperbarui parfum di database:", err);
        alert("Gagal memperbarui parfum di database cloud.");
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  const handleDeleteParfum = async (id: string) => {
    let deletedItem: Parfum | undefined;
    const activeId = currentOwnerId;
    
    // Optimistic update
    setParfums((prev) => {
      deletedItem = prev.find(p => p.id === id);
      const updated = prev.filter(p => p.id !== id);
      localStorage.setItem("damdam_parfums", JSON.stringify(updated));
      return updated;
    });

    if (activeId) {
      const path = `users/${activeId}/parfum/${id}`;
      try {
        await deleteDoc(doc(db, "users", activeId, "parfum", id));
      } catch (err) {
        console.error("Gagal menghapus parfum dari database:", err);
        // Revert if explicit failure
        if (deletedItem) {
          setParfums((prev) => {
            const reverted = [deletedItem!, ...prev];
            localStorage.setItem("damdam_parfums", JSON.stringify(reverted));
            return reverted;
          });
        }
        alert("Gagal menghapus parfum dari database cloud.");
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  const handleSeedDefaultParfums = async () => {
    const defaults = ["Lavender Sensation", "Sakura Blossom", "Lily Fresh", "Lemon Citrus", "Molto Gold", "Ocean Fresh", "Maura", "Dianamist", "Lovely", "Polos (Tanpa Parfum)"];
    
    if (currentOwnerId) {
      try {
        const batch = writeBatch(db);
        defaults.forEach((nama) => {
          const id = "PFM-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
          const pRef = doc(db, "users", currentOwnerId, "parfum", id);
          batch.set(pRef, {
            id,
            nama,
            userId: currentOwnerId,
            createdAt: new Date().toISOString()
          });
        });
        await batch.commit();
      } catch (err) {
        console.error("Gagal seeding default parfum:", err);
      }
    } else {
      const list: Parfum[] = defaults.map((nama) => ({
        id: "PFM-" + Math.random().toString(36).substring(2, 10).toUpperCase(),
        nama,
        userId: "guest",
        createdAt: new Date().toISOString()
      }));
      setParfums((prev) => [...list, ...prev]);
    }
  };

  const handleExportServices = () => {
    if (services.length === 0) {
      alert("Tidak ada layanan untuk diekspor!");
      return;
    }
    const headers = ["ID", "Nama Layanan", "Kategori", "Satuan", "Harga", "Estimasi Selesai", "Minimal Kuantitas", "Proses"];
    const rows = services.map(s => [
      s.id,
      s.nama,
      s.kategori || "-",
      s.tipe || "Kiloan",
      s.harga,
      s.durasiJam >= 24 ? `${Math.round(s.durasiJam / 24)} Hari` : `${s.durasiJam} Jam`,
      s.minimalKuantitas || 1,
      s.proses ? s.proses.join(", ") : "Cuci"
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `damdam_layanan_laundry_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddServiceCategory = () => {
    const trimmed = newServiceCategoryInput.trim();
    if (!trimmed) return;
    if (customServiceCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      alert("Kategori dengan nama ini sudah ada!");
      return;
    }
    setCustomServiceCategories([...customServiceCategories, trimmed]);
    setNewServiceCategoryInput("");
  };

  const handleUpdateServiceCategory = (index: number) => {
    const trimmedValue = editingServiceCategoryValue.trim();
    if (!trimmedValue) return;
    const oldName = customServiceCategories[index];
    
    // Update categories array
    const updatedCategories = [...customServiceCategories];
    updatedCategories[index] = trimmedValue;
    setCustomServiceCategories(updatedCategories);
    
    // Cascade update to services
    const updatedServices = services.map(s => {
      if (s.kategori?.toLowerCase() === oldName.toLowerCase()) {
        return { ...s, kategori: trimmedValue };
      }
      return s;
    });
    setServices(updatedServices);
    localStorage.setItem("damdam_services", JSON.stringify(updatedServices));
    
    setEditingServiceCategoryIndex(null);
  };

  const handleDeleteServiceCategory = (index: number) => {
    const catName = customServiceCategories[index];
    if (catName === "Tanpa Kategori" || catName === "Semua") return;
    
    if (window.confirm(`Hapus kategori "${catName}"? Layanan dengan kategori ini akan dipindahkan ke "Tanpa Kategori"`)) {
      // Delete from categories array
      const updatedCategories = customServiceCategories.filter((_, i) => i !== index);
      setCustomServiceCategories(updatedCategories);
      
      // Cascade update to services
      const updatedServices = services.map(s => {
        if (s.kategori === catName) {
          return { ...s, kategori: "Tanpa Kategori" };
        }
        return s;
      });
      setServices(updatedServices);
      localStorage.setItem("damdam_services", JSON.stringify(updatedServices));
    }
  };

  const openCreateServiceSubtab = () => {
    setEditingService(null);
    setSubtrackServName("");
    setSubtrackServType("Kiloan");
    setSubtrackServPrice(0);
    setSubtrackServDurationValue(24);
    setSubtrackServDurationTipe("Jam");
    setSubtrackServProses(["Cuci", "Pengeringan"]);
    setSubtrackServMinQty(1);
    setSubtrackServCategory("Kiloan");
    setSubtrackServSematkan(false);
    setIsCreatingServiceInSubtab(true);
  };

  const openEditServiceSubtab = (s: Service) => {
    setEditingService(s);
    setSubtrackServName(s.nama);
    setSubtrackServType(s.tipe || "Kiloan");
    setSubtrackServPrice(s.harga);
    // Parse duration values
    const durTipe = s.durasiTipe || (s.durasiJam % 24 === 0 ? "Hari" : "Jam");
    const durValue = s.durasiValue || (durTipe === "Hari" ? s.durasiJam / 24 : s.durasiJam);
    setSubtrackServDurationValue(durValue);
    setSubtrackServDurationTipe(durTipe);
    setSubtrackServProses(s.proses || ["Cuci", "Pengeringan"]);
    setSubtrackServMinQty(s.minimalKuantitas || 1);
    setSubtrackServCategory(s.kategori || "Kiloan");
    setSubtrackServSematkan(!!s.sematkan);
    setIsCreatingServiceInSubtab(true);
  };

  const handleSaveServiceSubtab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtrackServName || subtrackServPrice < 0) return;

    const calculatedDurasiJam = subtrackServDurationTipe === "Hari" ? (subtrackServDurationValue * 24) : subtrackServDurationValue;
    
    if (editingService) {
      // Update
      const updated: Service = {
        ...editingService,
        nama: subtrackServName,
        tipe: subtrackServType,
        harga: subtrackServPrice,
        durasiJam: calculatedDurasiJam,
        proses: subtrackServProses,
        durasiValue: subtrackServDurationValue,
        durasiTipe: subtrackServDurationTipe,
        minimalKuantitas: subtrackServMinQty,
        kategori: subtrackServCategory,
        sematkan: subtrackServSematkan
      };
      await handleUpdateService(updated);
    } else {
      // Create
      const newId = "SERV-" + Date.now().toString().slice(-6);
      const newService: Service = {
        id: newId,
        nama: subtrackServName,
        tipe: subtrackServType,
        harga: subtrackServPrice,
        durasiJam: calculatedDurasiJam,
        userId: currentOwnerId || "guest",
        proses: subtrackServProses,
        durasiValue: subtrackServDurationValue,
        durasiTipe: subtrackServDurationTipe,
        minimalKuantitas: subtrackServMinQty,
        kategori: subtrackServCategory,
        sematkan: subtrackServSematkan
      };
      await handleAddService(newService);
    }

    // Reset and close
    setIsCreatingServiceInSubtab(false);
    setEditingService(null);
  };


  // Database Handlers (Create, update, delete)
  const handleAddExpense = async (newExp: Omit<Expense, "id">) => {
    const fresh: Expense = {
      ...newExp,
      id: `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    };

    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/expenses/${fresh.id}`;
      try {
        const cleaned: Record<string, any> = {};
        for (const [key, val] of Object.entries(fresh)) {
          if (val !== undefined && val !== null) {
            cleaned[key] = val;
          }
        }
        await setDoc(doc(db, "users", currentOwnerId, "expenses", fresh.id), {
          ...cleaned,
          userId: currentOwnerId
        });

        // Sync and update karyawan's kasbon field if category is "Kasbon Karyawan"
        if (fresh.category === "Kasbon Karyawan" && fresh.karyawanId) {
          const karyawanRef = doc(db, "users", currentOwnerId, "karyawan", fresh.karyawanId);
          const karyawanSnap = await getDoc(karyawanRef);
          if (karyawanSnap.exists()) {
            const karyawanData = karyawanSnap.data();
            const currentKasbon = typeof karyawanData.kasbon === "number" ? karyawanData.kasbon : Number(karyawanData.kasbon) || 0;
            const expAmount = typeof fresh.amount === "number" ? fresh.amount : Number(fresh.amount) || 0;
            const newKasbon = currentKasbon + expAmount;
            await setDoc(karyawanRef, { kasbon: newKasbon }, { merge: true });

            // Log new kasbon history
            const historyId = "KSB-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
            const histRef = doc(db, "users", currentOwnerId, "kasbon_history", historyId);
            await setDoc(histRef, {
              id: historyId,
              karyawanId: fresh.karyawanId,
              karyawanNama: karyawanData.nama || "Staf",
              tipe: "penambahan",
              jumlah: expAmount,
              tanggal: fresh.date,
              keterangan: fresh.notes || `Pemberian kasbon: ${fresh.title}`,
              createdAt: new Date().toISOString()
            });
          }
        }
      } catch (err) {
        console.error("Firestore create error:", err);
        alert("Gagal menambahkan transaksi ke cloud: " + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      setExpenses((prev) => [fresh, ...prev]);

      // Update local state for offline usage
      if (fresh.category === "Kasbon Karyawan" && fresh.karyawanId) {
        setKaryawans((prev) =>
          prev.map((k) => (k.id === fresh.karyawanId ? { ...k, kasbon: (k.kasbon || 0) + fresh.amount } : k))
        );
      }
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/expenses/${id}`;
      try {
        const expToDelete = expenses.find((e) => e.id === id);
        if (expToDelete && expToDelete.category === "Kasbon Karyawan" && expToDelete.karyawanId) {
          const karyawanRef = doc(db, "users", currentOwnerId, "karyawan", expToDelete.karyawanId);
          const karyawanSnap = await getDoc(karyawanRef);
          if (karyawanSnap.exists()) {
            const karyawanData = karyawanSnap.data();
            const currentKasbon = typeof karyawanData.kasbon === "number" ? karyawanData.kasbon : Number(karyawanData.kasbon) || 0;
            const expAmount = typeof expToDelete.amount === "number" ? expToDelete.amount : Number(expToDelete.amount) || 0;
            const newKasbon = Math.max(0, currentKasbon - expAmount);
            await setDoc(karyawanRef, { kasbon: newKasbon }, { merge: true });

            // Log correction/deletion to history
            const historyId = "KSB-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
            const histRef = doc(db, "users", currentOwnerId, "kasbon_history", historyId);
            await setDoc(histRef, {
              id: historyId,
              karyawanId: expToDelete.karyawanId,
              karyawanNama: karyawanData.nama || "Staf",
              tipe: "pengurangan",
              jumlah: expAmount,
              tanggal: new Date().toISOString().substring(0, 10),
              keterangan: `Penghapusan transaksi Kasbon Karyawan: ${expToDelete.title}`,
              createdAt: new Date().toISOString()
            });
          }
        }
        await deleteDoc(doc(db, "users", currentOwnerId, "expenses", id));
      } catch (err) {
        console.error("Firestore delete error:", err);
        alert("Gagal menghapus transaksi dari cloud: " + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      const expToDelete = expenses.find((e) => e.id === id);
      if (expToDelete && expToDelete.category === "Kasbon Karyawan" && expToDelete.karyawanId) {
        setKaryawans((prev) =>
          prev.map((k) => (k.id === expToDelete.karyawanId ? { ...k, kasbon: Math.max(0, (typeof k.kasbon === "number" ? k.kasbon : Number(k.kasbon) || 0) - (typeof expToDelete.amount === "number" ? expToDelete.amount : Number(expToDelete.amount) || 0)) } : k))
        );
      }
      setExpenses((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleUpdateExpense = async (updated: Expense) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/expenses/${updated.id}`;
      try {
        const oldExp = expenses.find((e) => e.id === updated.id);
        if (oldExp && oldExp.category === "Kasbon Karyawan" && oldExp.karyawanId) {
          const karyawanRef = doc(db, "users", currentOwnerId, "karyawan", oldExp.karyawanId);
          const karyawanSnap = await getDoc(karyawanRef);
          if (karyawanSnap.exists()) {
            const karyawanData = karyawanSnap.data();
            const currentKasbon = typeof karyawanData.kasbon === "number" ? karyawanData.kasbon : Number(karyawanData.kasbon) || 0;
            const oldAmount = typeof oldExp.amount === "number" ? oldExp.amount : Number(oldExp.amount) || 0;
            const updatedAmount = typeof updated.amount === "number" ? updated.amount : Number(updated.amount) || 0;
            const tempKasbon = currentKasbon - oldAmount;
            const finalKasbon = Math.max(0, tempKasbon + (updated.category === "Kasbon Karyawan" ? updatedAmount : 0));
            await setDoc(karyawanRef, { kasbon: finalKasbon }, { merge: true });

            // Log update to history
            const diff = (updated.category === "Kasbon Karyawan" ? updatedAmount : 0) - oldAmount;
            if (diff !== 0) {
              const historyId = "KSB-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
              const histRef = doc(db, "users", currentOwnerId, "kasbon_history", historyId);
              await setDoc(histRef, {
                id: historyId,
                karyawanId: oldExp.karyawanId,
                karyawanNama: karyawanData.nama || "Staf",
                tipe: diff > 0 ? "penambahan" : "pengurangan",
                jumlah: Math.abs(diff),
                tanggal: updated.date,
                keterangan: `Penyesuaian nominal kasbon dari Rp ${oldAmount.toLocaleString()} menjadi Rp ${(updated.category === "Kasbon Karyawan" ? updatedAmount : 0).toLocaleString()}`,
                createdAt: new Date().toISOString()
              });
            }
          }
        } else if (updated.category === "Kasbon Karyawan" && updated.karyawanId) {
          const karyawanRef = doc(db, "users", currentOwnerId, "karyawan", updated.karyawanId);
          const karyawanSnap = await getDoc(karyawanRef);
          if (karyawanSnap.exists()) {
            const karyawanData = karyawanSnap.data();
            const currentKasbon = typeof karyawanData.kasbon === "number" ? karyawanData.kasbon : Number(karyawanData.kasbon) || 0;
            const updatedAmount = typeof updated.amount === "number" ? updated.amount : Number(updated.amount) || 0;
            const newKasbon = currentKasbon + updatedAmount;
            await setDoc(karyawanRef, { kasbon: newKasbon }, { merge: true });

            // Log new kasbon from update
            const historyId = "KSB-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
            const histRef = doc(db, "users", currentOwnerId, "kasbon_history", historyId);
            await setDoc(histRef, {
              id: historyId,
              karyawanId: updated.karyawanId,
              karyawanNama: karyawanData.nama || "Staf",
              tipe: "penambahan",
              jumlah: updatedAmount,
              tanggal: updated.date,
              keterangan: updated.notes || `Pemberian kasbon via update: ${updated.title}`,
              createdAt: new Date().toISOString()
            });
          }
        }

        const cleaned: Record<string, any> = {};
        for (const [key, val] of Object.entries(updated)) {
          if (val !== undefined && val !== null) {
            cleaned[key] = val;
          }
        }
        await setDoc(doc(db, "users", currentOwnerId, "expenses", updated.id), {
          ...cleaned,
          userId: currentOwnerId
        });
      } catch (err) {
        console.error("Firestore update error:", err);
        alert("Gagal memperbarui transaksi di cloud: " + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      const oldExp = expenses.find((e) => e.id === updated.id);
      if (oldExp && oldExp.category === "Kasbon Karyawan" && oldExp.karyawanId) {
        setKaryawans((prev) =>
          prev.map((k) => {
            if (k.id === oldExp.karyawanId) {
              const tempKasbon = (k.kasbon || 0) - oldExp.amount;
              const finalKasbon = Math.max(0, tempKasbon + (updated.category === "Kasbon Karyawan" ? updated.amount : 0));
              return { ...k, kasbon: finalKasbon };
            }
            return k;
          })
        );
      } else if (updated.category === "Kasbon Karyawan" && updated.karyawanId) {
        setKaryawans((prev) =>
          prev.map((k) => (k.id === updated.karyawanId ? { ...k, kasbon: (k.kasbon || 0) + updated.amount } : k))
        );
      }
      setExpenses((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    }
  };

  const handleAddReminder = async (newRem: Reminder) => {
    const targetOwnerId = currentOwnerId || "guest";
    // 1. Update state optimistically so UI responds instantly
    setReminders((prev) => {
      const filtered = prev.filter((item) => item.id !== newRem.id);
      return [...filtered, newRem].sort((a, b) => {
        const valA = a?.dueDate || "";
        const valB = b?.dueDate || "";
        return valA.localeCompare(valB);
      });
    });

    // 2. Direct Firestore write
    try {
      const cleaned: Record<string, any> = {};
      for (const [key, val] of Object.entries(newRem)) {
        if (val !== undefined && val !== null) {
          cleaned[key] = val;
        }
      }
      await setDoc(doc(db, "users", targetOwnerId, "reminders", newRem.id), {
        ...cleaned,
        userId: targetOwnerId
      });
    } catch (err) {
      console.error("Firestore reminder create error:", err);
      handleFirestoreError(err, OperationType.CREATE, `users/${targetOwnerId}/reminders/${newRem.id}`);
    }
  };

  const handleUpdateReminder = async (updatedRem: Reminder) => {
    const targetOwnerId = currentOwnerId || "guest";
    // 1. Update state optimistically so UI responds instantly
    setReminders((prev) => {
      return prev.map((item) => (item.id === updatedRem.id ? updatedRem : item))
                 .sort((a, b) => {
                   const valA = a?.dueDate || "";
                   const valB = b?.dueDate || "";
                   return valA.localeCompare(valB);
                 });
    });

    // 2. Direct Firestore write
    try {
      const cleaned: Record<string, any> = {};
      for (const [key, val] of Object.entries(updatedRem)) {
        if (val !== undefined && val !== null) {
          cleaned[key] = val;
        }
      }
      await setDoc(doc(db, "users", targetOwnerId, "reminders", updatedRem.id), {
        ...cleaned,
        userId: targetOwnerId
      });
    } catch (err) {
      console.error("Firestore reminder update error:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetOwnerId}/reminders/${updatedRem.id}`);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    const targetOwnerId = currentOwnerId || "guest";
    // 1. Update state optimistically so UI responds instantly
    setReminders((prev) => prev.filter((item) => item.id !== id));

    // 2. Direct Firestore delete
    try {
      await deleteDoc(doc(db, "users", targetOwnerId, "reminders", id));
    } catch (err) {
      console.error("Firestore reminder delete error:", err);
      handleFirestoreError(err, OperationType.DELETE, `users/${targetOwnerId}/reminders/${id}`);
    }
  };

  const handleAddCategory = async (name: string, color: string, icon: string = "Tag") => {
    const cleanName = name.trim();
    if (!cleanName || categories[cleanName]) return;

    const colorMap: Record<string, string> = {
      "#10b981": "bg-[#062419] text-[#10b981] border-[#10b981]/30",
      "#fbbf24": "bg-[#2d220a] text-[#fbbf24] border-[#fbbf24]/30",
      "#f43f5e": "bg-[#2e0b11] text-[#f43f5e] border-[#f43f5e]/30",
      "#0ea5e9": "bg-[#081e2b] text-[#0ea5e9] border-[#0ea5e9]/30",
      "#8b5cf6": "bg-[#1f0f3d] text-[#8b5cf6] border-[#8b5cf6]/30",
      "#d946ef": "bg-[#2d0a33] text-[#d946ef] border-[#d946ef]/30",
      "#38bdf8": "bg-[#0c1e30] text-[#38bdf8] border-[#38bdf8]/30",
      "#a1a1aa": "bg-[#18181b] text-[#e4e4e7] border-[#27272a]"
    };

    const bgColor = colorMap[color] || "bg-[#18181b] text-white border-[#27272a]";

    const fresh: CategorySpec = {
      name: cleanName,
      color,
      bgColor,
      icon
    };

    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/categories/${cleanName}`;
      try {
        await setDoc(doc(db, "users", currentOwnerId, "categories", cleanName), {
          ...fresh,
          userId: currentOwnerId
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    } else {
      setCategories((prev) => ({
        ...prev,
        [cleanName]: fresh
      }));
    }
  };

  const handleUpdateCategory = async (oldName: string, newName: string, newColor: string) => {
    const cleanNewName = newName.trim();
    if (!cleanNewName) return;

    const colorMap: Record<string, string> = {
      "#10b981": "bg-[#062419] text-[#10b981] border-[#10b981]/30",
      "#fbbf24": "bg-[#2d220a] text-[#fbbf24] border-[#fbbf24]/30",
      "#f43f5e": "bg-[#2e0b11] text-[#f43f5e] border-[#f43f5e]/30",
      "#0ea5e9": "bg-[#081e2b] text-[#0ea5e9] border-[#0ea5e9]/30",
      "#8b5cf6": "bg-[#1f0f3d] text-[#8b5cf6] border-[#8b5cf6]/30",
      "#d946ef": "bg-[#2d0a33] text-[#d946ef] border-[#d946ef]/30",
      "#38bdf8": "bg-[#0c1e30] text-[#38bdf8] border-[#38bdf8]/30",
      "#a1a1aa": "bg-[#18181b] text-[#e4e4e7] border-[#27272a]"
    };

    const newBgColor = colorMap[newColor] || "bg-[#18181b] text-white border-[#27272a]";

    if (currentOwnerId) {
      const newPath = `users/${currentOwnerId}/categories/${cleanNewName}`;
      try {
        const batch = writeBatch(db);
        if (oldName !== cleanNewName) {
          batch.delete(doc(db, "users", currentOwnerId, "categories", oldName));
        }

        const oldIcon = categories[oldName]?.icon || "Tag";
        const oldSubs = categories[oldName]?.subCategories || [];
        batch.set(doc(db, "users", currentOwnerId, "categories", cleanNewName), {
          name: cleanNewName,
          color: newColor,
          bgColor: newBgColor,
          icon: oldIcon,
          subCategories: oldSubs,
          userId: currentOwnerId
        });

        // Cascade category updates to matching expenses
        expenses.forEach((exp) => {
          if (exp.category === oldName) {
            batch.set(doc(db, "users", currentOwnerId, "expenses", exp.id), {
              ...exp,
              category: cleanNewName,
              userId: currentOwnerId
            });
          }
        });

        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, newPath);
      }
    } else {
      setCategories((prev) => {
        const updated = { ...prev };
        const oldIcon = updated[oldName]?.icon || "Tag";
        const oldSubs = updated[oldName]?.subCategories || [];

        if (oldName !== cleanNewName) {
          delete updated[oldName];
        }

        updated[cleanNewName] = {
          name: cleanNewName,
          color: newColor,
          bgColor: newBgColor,
          icon: oldIcon,
          subCategories: oldSubs
        };

        return updated;
      });

      // Cascade in state
      setExpenses((prev) => 
        prev.map((exp) => 
          exp.category === oldName 
            ? { ...exp, category: cleanNewName } 
            : exp
        )
      );
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/categories/${catName}`;
      try {
        await deleteDoc(doc(db, "users", currentOwnerId, "categories", catName));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    } else {
      setCategories((prev) => {
        const updated = { ...prev };
        delete updated[catName];
        return updated;
      });
    }
  };

  const handleUpdateSubCategories = async (
    catName: string, 
    subCats: string[], 
    renameMapping?: { oldName: string; newName: string }
  ) => {
    if (currentOwnerId) {
      try {
        const batch = writeBatch(db);
        const catRef = doc(db, "users", currentOwnerId, "categories", catName);
        batch.set(catRef, { subCategories: subCats }, { merge: true });

        const oldSubs = categories[catName]?.subCategories || [];

        if (renameMapping) {
          const { oldName, newName } = renameMapping;
          expenses.forEach((exp) => {
            if (exp.category === catName && exp.subCategory === oldName) {
              batch.update(doc(db, "users", currentOwnerId, "expenses", exp.id), {
                subCategory: newName
              });
            }
          });
        } else {
          const deletedSub = oldSubs.find((s) => !subCats.includes(s));
          if (deletedSub) {
            expenses.forEach((exp) => {
              if (exp.category === catName && exp.subCategory === deletedSub) {
                batch.update(doc(db, "users", currentOwnerId, "expenses", exp.id), {
                  subCategory: deleteField()
                });
              }
            });
          }
        }

        await batch.commit();
      } catch (err) {
        console.error("Gagal mengupdate sub kategori", err);
      }
    } else {
      setCategories((prev) => {
        if (!prev[catName]) return prev;
        const updated = {
          ...prev,
          [catName]: {
            ...prev[catName],
            subCategories: subCats
          }
        };
        localStorage.setItem("laundrosave_categories_clean_v2", JSON.stringify(updated));
        return updated;
      });

      if (renameMapping) {
        const { oldName, newName } = renameMapping;
        setExpenses((prev) =>
          prev.map((exp) =>
            exp.category === catName && exp.subCategory === oldName
              ? { ...exp, subCategory: newName }
              : exp
          )
        );
      } else {
        const oldSubs = categories[catName]?.subCategories || [];
        const deletedSub = oldSubs.find((s) => !subCats.includes(s));
        if (deletedSub) {
          setExpenses((prev) =>
            prev.map((exp) => {
              if (exp.category === catName && exp.subCategory === deletedSub) {
                const updatedExp = { ...exp };
                delete updatedExp.subCategory;
                return updatedExp;
              }
              return exp;
            })
          );
        }
      }
    }
  };

  const handleResetCategoriesToDefault = () => {
    triggerConfirm(
      "RESET KATEGORI",
      "Apakah Anda yakin ingin menyetel kembali semua kategori ke bawaan Damdam Laundry?",
      async () => {
        if (currentOwnerId) {
          const path = `users/${currentOwnerId}/categories`;
          try {
            const batch = writeBatch(db);
            for (const key of Object.keys(categories)) {
              batch.delete(doc(db, "users", currentOwnerId, "categories", key));
            }
            for (const [key, val] of Object.entries(PREDEFINED_CATEGORIES)) {
              batch.set(doc(db, "users", currentOwnerId, "categories", key), {
                ...val,
                userId: currentOwnerId
              });
            }
            await batch.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, path);
          }
        } else {
          setCategories(PREDEFINED_CATEGORIES);
        }
      },
      true
    );
  };

  const handleResetToEmpty = () => {
    triggerConfirm(
      "RESET TOTAL DATA",
      "Apakah Anda yakin ingin menghapus seluruh data transaksi (pengeluaran) & jenis kategori Anda untuk mulai menginput data secara mandiri dari nol?",
      async () => {
        if (currentOwnerId) {
          try {
            const batch = writeBatch(db);
            for (const exp of expenses) {
              batch.delete(doc(db, "users", currentOwnerId, "expenses", exp.id));
            }
            for (const key of Object.keys(categories)) {
              batch.delete(doc(db, "users", currentOwnerId, "categories", key));
            }
            batch.set(doc(db, "users", currentOwnerId, "categories", "Lain-lain"), {
              name: "Lain-lain",
              color: "#a1a1aa",
              bgColor: "bg-[#18181b] text-[#e4e4e7] border-[#27272a]",
              icon: "Coins",
              userId: currentOwnerId
            });

            await batch.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, `users/${currentOwnerId}`);
          }
        } else {
          setExpenses([]);
          const cleanCategories: Record<string, CategorySpec> = {
            "Lain-lain": {
              name: "Lain-lain",
              color: "#a1a1aa",
              bgColor: "bg-[#18181b] text-[#e4e4e7] border-[#27272a]",
              icon: "Coins"
            }
          };
          setCategories(cleanCategories);
          localStorage.removeItem("laundrosave_expenses_clean_v2");
          localStorage.removeItem("laundrosave_categories_clean_v2");
        }
      },
      true
    );
  };

  const handleLoadSampleData = () => {
    triggerConfirm(
      "MUAT DATA SAMPEL",
      "Atur ulang transaksi Anda dan muat data sampel laundry untuk uji coba?",
      async () => {
        if (currentOwnerId) {
          try {
            const batch = writeBatch(db);
            for (const exp of expenses) {
              batch.delete(doc(db, "users", currentOwnerId, "expenses", exp.id));
            }
            for (const key of Object.keys(categories)) {
              batch.delete(doc(db, "users", currentOwnerId, "categories", key));
            }
            for (const [key, val] of Object.entries(PREDEFINED_CATEGORIES)) {
              batch.set(doc(db, "users", currentOwnerId, "categories", key), {
                ...val,
                userId: currentOwnerId
              });
            }
            for (const exp of SAMPLE_EXPENSES) {
              batch.set(doc(db, "users", currentOwnerId, "expenses", exp.id), {
                ...exp,
                userId: currentOwnerId
              });
            }
            await batch.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${currentOwnerId}`);
          }
        } else {
          setExpenses(SAMPLE_EXPENSES);
          setCategories(PREDEFINED_CATEGORIES);
        }
      }
    );
  };

  const handleSetBudgetLimit = async (limit: number) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/settings/budget`;
      try {
        await setDoc(doc(db, "users", currentOwnerId, "settings", "budget"), { limit });
        setBudgetLimit(limit);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    } else {
      setBudgetLimit(limit);
    }
  };

  if (authLoading) {
    return (
      <MobileFrame>
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0A0A0B] text-zinc-500 font-sans min-h-[400px]">
          <span className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-3"></span>
          <p className="text-[10px] uppercase font-mono tracking-widest font-black text-zinc-500 animate-pulse">Menyiapkan Mesin Laundry...</p>
        </div>
      </MobileFrame>
    );
  }

  // Dual Portal Switcher when no session is active and not guest sandbox mode
  if (!user && !loggedInOwner && !loggedInAdmin && !loggedInKaryawan && !isGuestSession) {
    return (
      <MobileFrame>
        <div className="flex-1 flex flex-col bg-[#0A0A0B] text-white p-5 justify-between font-sans min-h-0 overflow-y-auto">
          {/* Brand Logo Header */}
          <div className="text-center py-4 select-none shrink-0 border-b border-[#1E1E21] pb-5">
            <div className="flex justify-center mb-4">
              <img
                src={damdamLogo}
                alt="Damdam Laundry"
                className="h-20 w-auto object-contain rounded-lg"
                referrerPolicy="no-referrer"
              />
            </div>
            <p className="text-[9.5px] font-black text-emerald-500 uppercase tracking-widest leading-none mt-1">
              Financial & Staff Engine
            </p>
          </div>

          {/* Switcher Tab Buttons */}
          <div className="flex-1 flex flex-col justify-center py-6 space-y-4">
            <div className="grid grid-cols-3 gap-1 bg-[#121214] p-1 border border-[#27272A] shrink-0 font-extrabold uppercase text-[9px] text-center">
              <button
                type="button"
                onClick={() => {
                  setPortalTab("owner");
                  setLoginError(null);
                }}
                className={`py-2 px-0.5 transition-all text-center cursor-pointer ${
                  portalTab === "owner" ? "bg-emerald-500 text-black font-black" : "text-zinc-400 hover:text-white"
                }`}
              >
                Owner
              </button>
              <button
                type="button"
                onClick={() => {
                  setPortalTab("admin");
                  setLoginError(null);
                }}
                className={`py-2 px-0.5 transition-all text-center cursor-pointer ${
                  portalTab === "admin" ? "bg-emerald-500 text-black font-black" : "text-zinc-400 hover:text-white"
                }`}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => {
                  setPortalTab("karyawan");
                  setLoginError(null);
                }}
                className={`py-2 px-0.5 transition-all text-center cursor-pointer ${
                  portalTab === "karyawan" ? "bg-emerald-500 text-black font-black" : "text-zinc-400 hover:text-white"
                }`}
              >
                Karyawan
              </button>
            </div>

            {portalTab === "owner" ? (
              <div className="bg-[#121214] border border-[#27272A] p-4 text-center space-y-4 leading-relaxed text-xs">
                <span className="text-[8.5px] font-mono leading-none bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 py-0.5 w-max font-black tracking-wider uppercase mx-auto block">
                  OWNER SIGN-IN
                </span>

                {!useManualOwnerLogin ? (
                  <>
                    <p className="text-zinc-400 font-semibold leading-relaxed max-w-[280px] mx-auto">
                      Kelola pencatatan pengeluaran, kategori, limit bulanan, serta pantau presensi & gaji kerja karyawan.
                    </p>

                    {loginError && loginError === "unauthorized-domain" && (
                      <div className="p-3 bg-[#1F1111] border border-red-900/40 text-left space-y-2 text-[11px] leading-relaxed rounded-none">
                        <p className="font-black text-red-500 uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Domain Belum Terotorisasi
                        </p>
                        <p className="text-zinc-350">
                          Firebase memerlukan registrasi domain ini agar Google Sign-In diizinkan:
                        </p>
                        <div className="bg-[#0A0A0B] p-2 border border-[#27272A] space-y-1 font-mono text-[9px] text-emerald-400 select-all rounded-none break-all font-black">
                          <div>{window.location.hostname}</div>
                          <div>ais-pre-mfr6gcnozkkr6qfe74ezht-273896989252.asia-southeast1.run.app</div>
                          <div>ais-dev-mfr6gcnozkkr6qfe74ezht-273896989252.asia-southeast1.run.app</div>
                        </div>
                        <p className="text-zinc-400 text-[10px]">
                          👉 Silakan salin domain di atas, lalu masukkan ke menu <strong className="text-white font-black">Authentication &gt; Settings &gt; Authorized Domains</strong> di Firebase Console Anda.
                        </p>
                        <p className="text-zinc-400 text-[10px]">
                          💡 Pastikan juga Anda membuka aplikasi ini di <strong className="text-white font-black">Tab Baru</strong> (klik ikon panah kanan atas di samping alamat URL) agar browser tidak memblokir popup Google.
                        </p>
                      </div>
                    )}

                    {loginError && loginError === "popup-blocked" && (
                      <div className="p-3 bg-[#1F1E11] border border-amber-900/40 text-left space-y-2 text-[11px] leading-relaxed rounded-none">
                        <p className="font-black text-amber-500 uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Popup Diblokir Browser
                        </p>
                        <p className="text-zinc-350">
                          Google Sign-In memerlukan jendela popup untuk menyelesaikan login.
                        </p>
                        <p className="text-zinc-400 text-[10px]">
                          👉 Pastikan Anda membuka aplikasi ini di <strong className="text-white font-black">Tab Baru</strong> (bukan di dalam iframe AI Studio) dan izinkan popup dari browser Anda.
                        </p>
                      </div>
                    )}

                    {loginError && loginError !== "unauthorized-domain" && loginError !== "popup-blocked" && (
                      <div className="p-2.5 bg-[#1F1111] border border-red-900/30 text-red-550 font-black font-sans text-[10px] uppercase text-center leading-tight">
                        Sign-in gagal: {loginError}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSignIn}
                      className="w-full py-3 bg-[#10b981] hover:bg-[#059669] text-black font-black text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Database className="w-4 h-4" />
                      Masuk dengan Akun Google
                    </button>

                    <div className="pt-2 border-t border-zinc-900 mt-2">
                      <p className="text-[10px] text-zinc-500 font-semibold mb-2">
                        Mengalami kendala otorisasi Google / Firebase?
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setUseManualOwnerLogin(true);
                          fetchRegisteredOwners();
                        }}
                        className="text-[10.5px] font-black text-emerald-400 hover:text-emerald-300 underline uppercase tracking-wider"
                      >
                        Masuk Manual (Username & Password) &rarr;
                      </button>
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleManualOwnerLogin} className="text-left space-y-3">
                    <p className="text-zinc-400 font-semibold text-[10.5px] leading-relaxed text-center">
                      🔐 Masuk Owner via Mode Manual Bypass Credential
                    </p>

                    {loginError && (
                      <div className="p-2 bg-[#1F1111] border border-red-900/30 text-red-400 font-black text-[10px] uppercase leading-tight">
                        {loginError}
                      </div>
                    )}

                    <div className="space-y-3 font-semibold text-zinc-300">
                      <div>
                        <label className="text-[8.5px] font-black uppercase text-zinc-500 block mb-1">Username Owner</label>
                        <input
                          type="text"
                          required
                          placeholder="Masukkan 'owner'"
                          value={loginUser}
                          onChange={(e) => setLoginUser(e.target.value)}
                          className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 font-mono text-xs rounded-none"
                        />
                      </div>

                      <div>
                        <label className="text-[8.5px] font-black uppercase text-zinc-500 block mb-1">Password</label>
                        <input
                          type="password"
                          required
                          placeholder="Masukkan 'damdam'"
                          value={loginPass}
                          onChange={(e) => setLoginPass(e.target.value)}
                          className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 font-mono text-xs rounded-none"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[8.5px] font-black uppercase text-zinc-500 block">Pilih Akun Firebase</label>
                          <button
                            type="button"
                            onClick={fetchRegisteredOwners}
                            className="text-[8.5px] text-emerald-400 hover:underline font-extrabold uppercase"
                          >
                            {loadingOwners ? "Memuat..." : "Refresh"}
                          </button>
                        </div>
                        
                        <select
                          value={manualOwnerSelectedUid}
                          onChange={(e) => {
                            setManualOwnerSelectedUid(e.target.value);
                            if (e.target.value !== "custom_uid") {
                              setCustomManualUid("");
                            }
                          }}
                          className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-2.5 py-2 outline-none focus:border-emerald-500 text-xs rounded-none"
                        >
                          {registeredOwners.length === 0 && (
                            <option value="">-- Tidak Ada Akun Terdaftar di DB --</option>
                          )}
                          {registeredOwners.map((owner) => (
                            <option key={owner.uid} value={owner.uid}>
                              {owner.displayName} ({owner.email || owner.uid.slice(0, 8)})
                            </option>
                          ))}
                          <option value="custom_uid">&larr; Masukkan UID / ID Kustom Manual &rarr;</option>
                        </select>
                      </div>

                      {(manualOwnerSelectedUid === "custom_uid" || manualOwnerSelectedUid === "") && (
                        <div>
                          <label className="text-[8.5px] font-black uppercase text-zinc-500 block mb-1">
                            Firebase ID / UID Kustom Owner
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Salin UID owner dari Firebase Console / LocalStorage"
                            value={customManualUid}
                            onChange={(e) => {
                              setCustomManualUid(e.target.value);
                            }}
                            className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 font-mono text-[10.5px] rounded-none"
                          />
                        </div>
                      )}
                    </div>

                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setUseManualOwnerLogin(false)}
                        className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-[#27272A] text-zinc-400 font-black text-[10px] uppercase tracking-wider transition-all duration-150 rounded-none text-center"
                      >
                        &larr; Google
                      </button>
                      
                      <button
                        type="submit"
                        disabled={loginLoading}
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider transition-all duration-150 rounded-none text-center flex items-center justify-center gap-1"
                      >
                        {loginLoading ? "Memproses..." : "Masuk Manual"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : portalTab === "admin" ? (
              <form onSubmit={handleAdminLogin} className="bg-[#121214] border border-[#27272A] p-4 text-left space-y-3 text-xs leading-normal">
                <span className="text-[8.5px] font-mono leading-none bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 py-0.5 w-max font-black tracking-wider uppercase block mx-auto text-center mb-1">
                  PORTAL MASUK ADMIN
                </span>
                
                {loginError && (
                  <div className="p-2.5 bg-[#1F1111] border border-red-900/30 text-red-500 font-black border-l-2 border-l-red-500 font-sans text-[10px] uppercase text-center leading-tight">
                    {loginError}
                  </div>
                )}
 
                <div className="space-y-3 font-semibold text-zinc-300">
                  <div>
                    <label className="text-[8.5px] font-black uppercase text-zinc-550 block mb-1">Username Admin</label>
                    <input
                      type="text"
                      required
                      placeholder="username"
                      value={loginUser}
                      onChange={(e) => setLoginUser(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 font-mono text-xs rounded-none"
                    />
                  </div>
                  <div>
                    <label className="text-[8.5px] font-black uppercase text-zinc-550 block mb-1">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 font-mono text-xs rounded-none"
                    />
                  </div>
                </div>
 
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-widest transition-all cursor-pointer rounded-none disabled:opacity-50 mt-1"
                >
                  {loginLoading ? "OTENTIKASI MASUK..." : "LOG-IN ADMIN"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleKaryawanLogin} className="bg-[#121214] border border-[#27272A] p-4 text-left space-y-3 text-xs leading-normal">
                <span className="text-[8.5px] font-mono leading-none bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 py-0.5 w-max font-black tracking-wider uppercase block mx-auto text-center mb-1">
                  PRESENSI KARYAWAN
                </span>
                
                {loginError && (
                  <div className="p-2.5 bg-[#1F1111] border border-red-900/30 text-red-500 font-black border-l-2 border-l-red-500 font-sans text-[10px] uppercase text-center leading-tight">
                    {loginError}
                  </div>
                )}
 
                <div className="space-y-3 font-semibold text-zinc-300">
                  <div>
                    <label className="text-[8.5px] font-black uppercase text-zinc-550 block mb-1">Username Login</label>
                    <input
                      type="text"
                      required
                      placeholder="username"
                      value={loginUser}
                      onChange={(e) => setLoginUser(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 font-mono text-xs rounded-none"
                    />
                  </div>
                  <div>
                    <label className="text-[8.5px] font-black uppercase text-zinc-550 block mb-1">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      className="w-full bg-[#0A0A0B] border border-[#27272A] text-white px-3 py-2 outline-none focus:border-emerald-500 font-mono text-xs rounded-none"
                    />
                  </div>
                </div>
 
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-widest transition-all cursor-pointer rounded-none disabled:opacity-50 mt-1"
                >
                  {loginLoading ? "OTENTIKASI MASUK..." : "LOG-IN KARYAWAN"}
                </button>
              </form>
            )}
          </div>

          {/* Sandbox Switcher Footer */}
          <div className="text-center py-4 select-none shrink-0 border-t border-[#1E1E21] pt-4 space-y-3">
            <button
              type="button"
              onClick={() => setShowInstallGuide(true)}
              className="w-full py-2.5 bg-zinc-900 border border-[#27272A] hover:bg-zinc-850 hover:border-emerald-500 text-white font-black text-[9.5px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 duration-150 rounded-none active:scale-98"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              <span>CARA INSTALL / PASANG DI HP</span>
            </button>
            <button
              onClick={() => {
                localStorage.setItem("damdam_is_guest", "true");
                setIsGuestSession(true);
              }}
              className="text-[10px] font-black text-amber-500 hover:text-amber-400 underline uppercase tracking-widest cursor-pointer block mx-auto"
            >
              Lanjutkan sebagai Tamu (Mode Sandbox Offline)
            </button>
          </div>
        </div>
      </MobileFrame>
    );
  }

  // If logged in as Karyawan, completely isolate them in KaryawanDashboard
  if (loggedInKaryawan) {
    const backupLocation = {
      latitude: -6.2088,
      longitude: 106.8456,
      radius: 100,
      namaLokasi: "Outlet Damdam Laundry"
    };
    return (
      <MobileFrame>
        <KaryawanDashboard
          karyawan={loggedInKaryawan}
          ownerId={(loggedInKaryawan as any).ownerId || ""}
          defaultLocation={backupLocation}
          onLogout={handleKaryawanSignOut}
        />
      </MobileFrame>
    );
  }

  return (

    <MobileFrame>
      {/* 1. App Navigation Top Header bar */}
      <header className="w-full bg-[#0A0A0B] text-white border-b border-[#27272A] px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-4 select-none shrink-0 relative flex items-center justify-between z-40 md:pt-4">
        <div className="flex items-center gap-2">
          <img src={damdamLogo} alt="Logo" className="w-[18px] h-[18px] object-contain" />
          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 font-mono">DamDam</span>
        </div>

        {/* User context info & Cloud auth indicator */}
        <div className="flex items-center gap-1.5">
          {/* Theme switcher */}
          <button
            onClick={() => setTheme(prev => prev === "light" ? "dark" : "light")}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#121214] border border-[#27272A] hover:border-emerald-500 text-zinc-300 hover:text-emerald-400 text-[9.5px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-150 transition-all active:scale-95"
            title={theme === "light" ? "Ganti ke Mode Gelap (Dark)" : "Ganti ke Mode Terang (Light)"}
          >
            {theme === "light" ? <Moon className="w-3 h-3 text-sky-400 shrink-0" /> : <Sun className="w-3 h-3 text-amber-500 shrink-0" />}
            <span className="hidden xs:inline leading-none">{theme === "light" ? "GELAP" : "TERANG"}</span>
          </button>

          <button
            onClick={() => setShowMobileModal(true)}
            className="flex items-center gap-1 px-2 py-1 bg-[#121214] border border-[#27272A] hover:border-emerald-500 text-emerald-450 text-[9.5px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-150 transition-all active:scale-95"
            title="Scan QR Code untuk dicoba di HP"
          >
            <Smartphone className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="hidden md:inline leading-none">Coba di HP</span>
            <span className="md:hidden">HP</span>
          </button>

          {/* Printer Bluetooth Settings status pill */}
          <button
            onClick={() => setShowPrinterModal(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 border text-[9.5px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-150 transition-all active:scale-95 ${
              headerPrinterConnected 
                ? "bg-[#0d2a1f] border-emerald-500 text-emerald-400 font-extrabold" 
                : "bg-[#121214] border-[#27272A] hover:border-emerald-500 text-zinc-450"
            }`}
            title="Pengaturan Printer Bluetooth Thermal"
          >
            <Printer className={`w-3 h-3 shrink-0 ${headerPrinterConnected ? "text-emerald-450 animate-bounce" : "text-zinc-500"}`} />
            <span className="hidden md:inline leading-none">
              {headerPrinterConnected ? `PRINTER: ${headerPrinterDeviceName?.toUpperCase().slice(0, 8) || "ON"}` : "HUBUNGKAN PRINTER"}
            </span>
            <span className="md:hidden leading-none">
              {headerPrinterConnected ? "PRINTER ON" : "PRINTER"}
            </span>
          </button>

          {authLoading ? (
            <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest font-mono">Loading...</span>
          ) : loggedInAdmin ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-block text-[8.5px] font-black text-[#10B981] bg-emerald-950/40 px-2 py-0.5 rounded-none border border-emerald-900/60 uppercase tracking-tight font-mono">
                👤 ADMIN: {loggedInAdmin.nama.toUpperCase()}
              </span>
              <button
                onClick={handleAdminSignOut}
                title={`Keluar dari Akun Admin (${loggedInAdmin.username})`}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-950 border border-[#27272A] hover:border-red-850 hover:text-red-400 text-zinc-400 text-[9.5px] font-black uppercase tracking-wider duration-150 transition-all cursor-pointer rounded-none"
              >
                <LogOut className="w-3 h-3 text-red-500" />
                <span className="hidden md:inline leading-none">Keluar Admin</span>
                <span className="md:hidden">Keluar</span>
              </button>
              <div className="w-7 h-7 bg-blue-600 rounded-sm flex items-center justify-center font-black text-[10px] text-white shadow-sm uppercase">
                {loggedInAdmin.nama.slice(0, 2).toUpperCase()}
              </div>
            </div>
          ) : loggedInOwner ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-block text-[8.5px] font-black text-[#10B981] bg-emerald-950/40 px-2 py-0.5 rounded-none border border-emerald-900/60 uppercase tracking-tight font-mono">
                👤 OWNER (MANUAL)
              </span>
              <button
                onClick={handleSignOut}
                title={`Keluar dari Akun Owner manual (${loggedInOwner.displayName || loggedInOwner.email})`}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-950 border border-[#27272A] hover:border-red-850 hover:text-red-400 text-zinc-400 text-[9.5px] font-black uppercase tracking-wider duration-150 transition-all cursor-pointer rounded-none"
              >
                <LogOut className="w-3 h-3 text-red-500" />
                <span className="hidden md:inline leading-none">Keluar Owner</span>
                <span className="md:hidden">Keluar</span>
              </button>
              <div className="w-7 h-7 bg-emerald-500 rounded-sm flex items-center justify-center font-black text-[10px] text-black shadow-sm uppercase">
                {(loggedInOwner.displayName || loggedInOwner.email || "OW").slice(0, 2)}
              </div>
            </div>
          ) : user ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-block text-[8.5px] font-black text-[#10B981] bg-emerald-950/40 px-2 py-0.5 rounded-none border border-emerald-900/60 uppercase tracking-tight font-mono">
                👤 CLOUD OK
              </span>
              <button
                onClick={handleSignOut}
                title={`Keluar dan Ganti Akun Google (${user.displayName || user.email})`}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-950 border border-[#27272A] hover:border-red-850 hover:text-red-400 text-zinc-400 text-[9.5px] font-black uppercase tracking-wider duration-150 transition-all cursor-pointer rounded-none"
              >
                <LogOut className="w-3 h-3 text-red-500" />
                <span className="hidden md:inline leading-none">Ganti Akun / Keluar</span>
                <span className="md:hidden">Keluar</span>
              </button>
              {user.photoURL ? (
                <img 
                   src={user.photoURL} 
                  alt="Avatar" 
                  className="w-7 h-7 rounded-sm border border-emerald-500/50 shadow-sm" 
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <div className="w-7 h-7 bg-emerald-500 rounded-sm flex items-center justify-center font-black text-[10px] text-black shadow-sm uppercase">
                  {(user.displayName || user.email || "U").slice(0, 2)}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#10b981] hover:bg-[#059669] text-black text-[9.5px] font-black uppercase tracking-wider duration-150 transition-all cursor-pointer rounded-none active:scale-95 shadow-sm"
              title="Masuk Akun Google untuk Sinkronisasi Cloud Database"
            >
              <Database className="w-3.5 h-3.5 text-black" />
              <span>Masuk Google</span>
            </button>
          )}
        </div>
      </header>
 
      {/* Cloud Status Alert banner */}
      {!authLoading && !user && !loggedInOwner && !loggedInAdmin && (
        <div className="w-full bg-[#1A1108] border-b border-[#C2410C]/20 px-5 py-2 flex items-center justify-between text-left select-none shrink-0 z-30 font-sans">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-pulse" />
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-tight">
              Aplikasi Berjalan Offline (Guest Sandbox)
            </p>
            <span className="hidden leading-none pt-0.5 md:inline text-[9px] text-zinc-400 font-bold transition-all">
              - Hubungkan database cloud untuk mencegah kehilangan data laundry Anda.
            </span>
          </div>
          <button 
            onClick={handleSignIn}
            className="text-[9.5px] font-black text-emerald-400 hover:text-emerald-300 underline uppercase tracking-wider cursor-pointer"
          >
            Hubungkan Sekarang
          </button>
        </div>
      )}

      {/* Syncing ongoing indicator */}
      {isSyncing && (
        <div className="w-full bg-[#0d2a1f] border-b border-emerald-800/25 px-5 py-2 flex items-center gap-2 select-none shrink-0 z-35 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <p className="text-[9.5px] font-black text-emerald-400 uppercase tracking-wider">
            Menyinkronkan data laundry dengan database cloud...
          </p>
        </div>
      )}

      {/* Synchronization Mismatch / Permission Error Banner */}
      {syncError && (
        <div className="w-full bg-[#1C0F0F] border-b border-red-900/40 px-5 py-2 flex items-center justify-between text-left select-none shrink-0 z-30 font-sans">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <div>
              <p className="text-[10px] font-black text-red-500 uppercase tracking-tight">
                Masalah Sinkronisasi: {syncError}
              </p>
              <p className="text-[8.5px] font-bold text-zinc-400 mt-0.5">
                Coba sign-out lalu masuk kembali menggunakan akun Google yang sama untuk memicu migrasi ulang data laundry Anda.
              </p>
            </div>
          </div>
          <button 
            onClick={() => setSyncError(null)}
            className="text-[9px] font-black text-zinc-450 hover:text-white border border-[#27272A] px-2 py-0.5 rounded-none uppercase cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {/* 2. Primary Scrollable View Screen body */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] relative">
        {activeTab === "dashboard" && (
          <>
            {dashboardSubTab === "home" && (
              <LaundryDashboard
                transactions={transactions}
                customers={customers}
                services={services}
                expenses={expenses}
                reminders={reminders}
                isAdmin={!!loggedInAdmin}
                onSetViewTab={(tab) => {
                  if (tab === "transaksi") {
                    setTrxDateFilter("");
                    setTrxSpecialFilter("");
                    setTrxSelectedDetailTrxId(null);
                    setDirectOpenCreateTrx(false);
                    setDirectOpenCreateCust(false);
                    setDirectOpenCreateServ(false);
                    setActiveTab("transaksi");
                  } else if (tab === "karyawan") {
                    setDashboardSubTab("karyawan");
                  } else if (tab === "laporan") {
                    if (loggedInAdmin) {
                      alert("Akses Ditolak: Peran Admin tidak memiliki izin untuk membuka menu Laporan.");
                      return;
                    }
                    setActiveTab("laporan");
                  } else {
                    setDashboardSubTab(tab);
                  }
                }}
                onSetSubTab={(sub) => {
                  if (sub === "pengeluaran") {
                    setDashboardSubTab("pengeluaran");
                    setExpensePanelTab("ringkasan");
                  } else {
                    setDashboardSubTab(sub);
                  }
                }}
                onTriggerNewTransaction={() => {
                  setPreviousTab(activeTab);
                  setActiveTab("transaksi");
                  setTrxDateFilter("");
                  setTrxSpecialFilter("");
                  setTrxSelectedDetailTrxId(null);
                  setDirectOpenCreateTrx(true);
                }}
                onTriggerNewCustomer={() => {
                  setDashboardSubTab("pelanggan");
                }}
                onTriggerNewService={() => {
                  setDashboardSubTab("layanan");
                }}
                onTriggerParfum={() => {
                  setDashboardSubTab("layanan");
                  setServiceSubSubTab("parfum");
                }}
                onViewIncomingToday={() => {
                  const today = new Date();
                  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                  setTrxDateFilter(todayStr);
                  setTrxSpecialFilter("");
                  setTrxSelectedDetailTrxId(null);
                  setActiveTab("transaksi");
                }}
                onViewDueToday={() => {
                  setTrxDateFilter("");
                  setTrxSpecialFilter("dueToday");
                  setTrxSelectedDetailTrxId(null);
                  setActiveTab("transaksi");
                }}
                onViewOverdue={() => {
                  setTrxDateFilter("");
                  setTrxSpecialFilter("overdue");
                  setTrxSelectedDetailTrxId(null);
                  setActiveTab("transaksi");
                }}
                onSelectTransactionDetail={(id) => {
                  setTrxSelectedDetailTrxId(id);
                  setActiveTab("transaksi");
                }}
                onViewMonthlyPaid={() => {
                  setTrxDateFilter("");
                  setTrxSpecialFilter("lunasBulanIni");
                  setTrxSelectedDetailTrxId(null);
                  setActiveTab("transaksi");
                }}
                onViewMonthlyDp={() => {
                  setTrxDateFilter("");
                  setTrxSpecialFilter("dpBulanIni");
                  setTrxSelectedDetailTrxId(null);
                  setActiveTab("transaksi");
                }}
                onViewMonthlyPaket={() => {
                  setTrxDateFilter("");
                  setTrxSpecialFilter("paketBulanIni");
                  setTrxSelectedDetailTrxId(null);
                  setActiveTab("transaksi");
                }}
                onViewAllDebt={(subType) => {
                  setTrxDateFilter("");
                  if (subType === "dp") {
                    setTrxSpecialFilter("dpHutang");
                  } else if (subType === "belumLunas") {
                    setTrxSpecialFilter("belumLunasHutang");
                  } else {
                    setTrxSpecialFilter("semuaHutang");
                  }
                  setTrxSelectedDetailTrxId(null);
                  setActiveTab("transaksi");
                }}
              />
            )}

            {dashboardSubTab === "pengingat" && (
              <BillReminders
                reminders={reminders}
                onAddReminder={handleAddReminder}
                onUpdateReminder={handleUpdateReminder}
                onDeleteReminder={handleDeleteReminder}
                onAddExpense={handleAddExpense}
                onSetSubTab={setDashboardSubTab}
                theme={theme}
                ownerId={currentOwnerId}
                karyawanList={karyawans}
              />
            )}

            {dashboardSubTab === "pengeluaran" && (
              <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans">
                {/* Embedded Sub-navigation Header */}
                <div className="p-3 bg-[#121214] border-b border-zinc-900 flex items-center justify-between shrink-0 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setDashboardSubTab("home")}
                      className="p-1 px-2.5 bg-zinc-950 border border-zinc-850 hover:border-emerald-500 duration-150 text-zinc-400 hover:text-white text-[10px] font-black uppercase rounded-none"
                    >
                      &larr; POS HOME
                    </button>
                    <span className="text-[10.5px] font-black text-emerald-400 uppercase tracking-widest">SUB: PENGELUARAN & BUDGET</span>
                  </div>
                  <div className="flex bg-zinc-950 p-0.5 border border-zinc-855 text-[8.5px] font-black uppercase">
                    {[
                      { key: "ringkasan", label: "Ringkasan" },
                      { key: "catat", label: "Catat Baru" },
                      { key: "riwayat", label: "Riwayat Pengeluaran" }
                    ].map((st) => (
                      <button
                        key={st.key}
                        onClick={() => {
                          setExpensePanelTab(st.key);
                          setInitialExpenseDate("");
                        }}
                        className={`px-3 py-1 cursor-pointer rounded-none transition-all duration-150 ${expensePanelTab === st.key ? "bg-emerald-500 text-black font-black" : "text-zinc-400 hover:text-zinc-200"}`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                  {expensePanelTab === "ringkasan" && (
                    <DashboardHome
                      expenses={expenses}
                      budgetLimit={budgetLimit}
                      categories={categories}
                      onSetViewTab={(t, date) => {
                        if (date) {
                          setInitialExpenseDate(date);
                        } else {
                          setInitialExpenseDate("");
                        }
                        if (t === "catat") setExpensePanelTab("catat");
                        else setExpensePanelTab("riwayat");
                      }}
                      onSetBudgetLimit={handleSetBudgetLimit}
                      onResetToEmpty={handleResetToEmpty}
                      onLoadSampleData={handleLoadSampleData}
                    />
                  )}
                  {expensePanelTab === "catat" && (
                    <ExpenseForm
                      onAddExpense={handleAddExpense}
                      onSetViewTab={(t) => setExpensePanelTab("riwayat")}
                      categories={categories}
                      onAddCategory={handleAddCategory}
                      onUpdateCategory={handleUpdateCategory}
                      onDeleteCategory={handleDeleteCategory}
                      onResetCategoriesToDefault={handleResetCategoriesToDefault}
                      onUpdateSubCategories={handleUpdateSubCategories}
                      triggerConfirm={triggerConfirm}
                      karyawans={karyawans}
                      ownerId={currentOwnerId || ""}
                      expenses={expenses}
                      onDeleteExpense={handleDeleteExpense}
                    />
                  )}
                  {expensePanelTab === "riwayat" && (
                    <ExpenseHistory
                      expenses={expenses}
                      categories={categories}
                      onDeleteExpense={handleDeleteExpense}
                      onUpdateExpense={handleUpdateExpense}
                      triggerConfirm={triggerConfirm}
                      onAddCategory={handleAddCategory}
                      onUpdateCategory={handleUpdateCategory}
                      onDeleteCategory={handleDeleteCategory}
                      onResetCategoriesToDefault={handleResetCategoriesToDefault}
                      onUpdateSubCategories={handleUpdateSubCategories}
                      initialSearchTerm={initialExpenseSearchTerm}
                      initialSelectedDate={initialExpenseDate}
                      onClearSelectedDate={() => setInitialExpenseDate("")}
                      highlightExpenseId={highlightExpenseId}
                    />
                  )}
                </div>
              </div>
            )}

            {dashboardSubTab === "karyawan" && (
              <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans">
                <div className="p-4 bg-[#121214] border-b border-zinc-900 flex items-center gap-2 shrink-0">
                  <button 
                    onClick={() => setDashboardSubTab("home")}
                    className="p-1 px-2.5 bg-zinc-950 border border-zinc-850 hover:border-emerald-500 text-zinc-400 hover:text-white text-[10px] font-black uppercase rounded-none duration-150"
                  >
                    &larr; POS HOME
                  </button>
                  <span className="text-[10.5px] font-black text-emerald-400 uppercase tracking-widest">SUB: STAF & MONITORING ABSENSI</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {user || loggedInOwner ? (
                    <OwnerKaryawanPanel
                      ownerId={currentOwnerId!}
                      onAddExpense={handleAddExpense}
                      triggerConfirm={triggerConfirm}
                      expenses={expenses}
                      onDeleteExpense={handleDeleteExpense}
                    />
                  ) : (
                    <div className="p-10 text-center border border-dashed border-zinc-800 m-4 bg-zinc-950/20 font-sans">
                      <p className="text-xs font-black text-amber-500 uppercase tracking-wide">AKSES STAF TERBATAS (SANDBOX)</p>
                      <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed">
                        Manajemen pendaftaran karyawan, log absensi, geofencing lokasi kerja, dan monitoring kasbon membutuhkan database cloud aktif.
                      </p>
                      <button
                        onClick={handleSignIn}
                        className="mt-4 px-3 py-1.5 bg-emerald-500 font-black text-[9.5px] text-black uppercase tracking-wider hover:bg-emerald-400 duration-150"
                      >
                        AKTIFKAN CLOUD
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {dashboardSubTab === "pelanggan" && (() => {
              const filteredCustomers = customers.filter(c => {
                const q = searchCustomerQuery.toLowerCase().trim();
                if (!q) return true;
                return (
                  c.nama.toLowerCase().includes(q) ||
                  c.telepon.includes(q) ||
                  (c.alamat && c.alamat.toLowerCase().includes(q)) ||
                  c.id.toLowerCase().includes(q)
                );
              });

              return (
                <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans">
                  <div className="p-4 bg-[#121214] border-b border-zinc-900 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setDashboardSubTab("home")}
                        className="p-1 px-2.5 bg-zinc-950 border border-zinc-850 hover:border-emerald-500 text-zinc-400 hover:text-white text-[10px] font-black uppercase rounded-none duration-150"
                      >
                        &larr; POS HOME
                      </button>
                      <span className="text-[10.5px] font-black text-emerald-400 uppercase tracking-widest">SUB: DATABASE PELANGGAN ({customers.length})</span>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab("transaksi");
                        setDirectOpenCreateCust(true);
                      }}
                      className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] uppercase font-black tracking-wider transition-all rounded-none"
                    >
                      + Pelanggan
                    </button>
                  </div>

                  {/* Search Bar */}
                  <div className="p-3 bg-[#121214]/50 border-b border-[#27272A] shrink-0">
                    <div className="relative flex items-center bg-[#0F0F11] border border-zinc-800 focus-within:border-emerald-500/80 duration-150">
                      <span className="pl-3 text-zinc-500 shrink-0">
                        <Search className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="Cari nama, nomor hp, alamat, atau ID pelanggan..."
                        value={searchCustomerQuery}
                        onChange={(e) => setSearchCustomerQuery(e.target.value)}
                        className="w-full bg-transparent text-white p-2.5 pl-2 text-xs outline-none font-sans"
                      />
                      {searchCustomerQuery && (
                        <button
                          onClick={() => setSearchCustomerQuery("")}
                          className="pr-3 text-zinc-400 hover:text-white text-xs font-black"
                          title="Hapus pencarian"
                        >
                          BATAL
                        </button>
                      )}
                    </div>
                    {searchCustomerQuery && (
                      <p className="text-[10px] text-zinc-500 mt-1.5 font-mono px-1">
                        Ditemukan <span className="text-emerald-400 font-bold">{filteredCustomers.length}</span> dari {customers.length} pelanggan
                      </p>
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredCustomers.length === 0 ? (
                      <div className="p-8 text-center border border-dashed border-zinc-850">
                        <p className="text-[11px] text-zinc-500 font-bold font-mono">
                          {searchCustomerQuery ? "TIDAK ADA PELANGGAN YANG COCOK" : "BELUM ADA PELANGGAN TERDAFTAR"}
                        </p>
                        <p className="text-[10px] text-zinc-600 mt-1">
                          {searchCustomerQuery ? "Coba gunakan kata kunci pencarian yang lain." : "Tambahkan pelanggan baru dengan tombol di atas."}
                        </p>
                      </div>
                    ) : (
                      filteredCustomers.map(c => (
                        <div key={c.id} className="bg-[#121214] border border-[#27272A] p-3 flex justify-between items-center text-xs hover:border-emerald-500/55 duration-150 transition-all select-none">
                          <div 
                            className="flex-1 pr-3 cursor-pointer group"
                            onClick={() => {
                              setSelectedCustomerProfile(c);
                              setTopupAmount("");
                              setSelectedPastTrxInProfile(null);
                              setProfileShowUnpaid(false);
                              setProfileShowAll(false);
                              setShowCustomerProfileModal(true);
                            }}
                            title="Klik untuk detail & top up saldo"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white font-black text-[13px] group-hover:text-emerald-400 duration-100">{c.nama}</p>
                              {(c.saldoDeposit !== undefined && c.saldoDeposit > 0) && (
                                <span className="text-[8px] font-mono font-black text-emerald-400 bg-emerald-950/40 px-1 py-0.2 border border-emerald-900/40 uppercase tracking-wider">
                                  Saldo: Rp {c.saldoDeposit.toLocaleString("id-ID")}
                                </span>
                              )}
                            </div>
                            <p className="text-zinc-400 font-mono mt-0.5">{c.telepon}</p>
                            {c.alamat && <p className="text-zinc-500 mt-0.5 text-[11px] leading-snug">{c.alamat}</p>}
                            {c.createdAt && (
                              <p className="text-zinc-600 text-[8px] font-mono mt-1">
                                Gabung: {new Date(c.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                            <span className="text-[9px] font-mono font-black text-emerald-400 bg-emerald-950/20 px-1.5 py-0.5 border border-emerald-900/40">
                              {c.id}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  setSelectedCustomerForEdit(c);
                                  setEditCustomerName(c.nama);
                                  setEditCustomerPhone(c.telepon);
                                  setEditCustomerAddress(c.alamat || "");
                                  setEditCustomerParfum(c.parfumFavorit || "");
                                  setShowEditCustomerModal(true);
                                }}
                                className="p-1 px-1.5 bg-[#1C1C1E] border border-zinc-800 hover:border-emerald-500 text-zinc-400 hover:text-emerald-400 rounded-none duration-150 flex items-center gap-1 text-[9px] font-black uppercase cursor-pointer"
                                title="Ubah Pelanggan"
                              >
                                <Edit3 className="w-3 h-3 text-emerald-400" />
                                <span>Ubah</span>
                              </button>
                              <button
                                onClick={() => {
                                  triggerConfirm(
                                    "HAPUS PELANGGAN",
                                    `Apakah Anda yakin ingin menghapus pelanggan "${c.nama}"? Semua data transaksi yang merujuk secara tidak langsung ke pelanggan ini tidak akan terhapus, namun nama pelanggan tidak akan terhubung lagi ke database aktif.`,
                                    () => handleDeleteCustomer(c.id),
                                    true
                                  );
                                }}
                                className="p-1 px-1.5 bg-zinc-950/40 border border-zinc-900 hover:border-red-500 text-zinc-500 hover:text-red-400 rounded-none duration-150 flex items-center gap-1 text-[9px] font-black uppercase cursor-pointer"
                                title="Hapus Pelanggan"
                              >
                                <Trash2 className="w-3 h-3 text-rose-500" />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}
            
            {dashboardSubTab === "layanan" && (
              <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans relative">
                {/* Header with back arrow */}
                <div className="p-4 bg-[#121214] border-b border-zinc-900 flex items-center shrink-0">
                  <button 
                    onClick={() => {
                      setDashboardSubTab("home");
                      setServiceSubSubTab("layanan"); // Reset subtab
                    }}
                    className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white mr-3 transition"
                    title="Kembali ke POS Home"
                  >
                    <ArrowLeft className="w-5 h-5 text-sky-450" />
                  </button>
                  <h2 className="text-white font-extrabold text-base uppercase tracking-tight">Layanan</h2>
                </div>

                 {/* Sub Tab selection (Layanan vs Kategori vs Parfum) */}
                <div className="flex border-b border-zinc-900 bg-[#121214] select-none">
                  <button
                    type="button"
                    onClick={() => setServiceSubSubTab("layanan")}
                    className={`flex-1 py-3 text-center text-[11px] font-black uppercase tracking-wider transition-all relative ${
                      serviceSubSubTab === "layanan" ? "text-sky-400 font-extrabold" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Layanan
                    {serviceSubSubTab === "layanan" && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceSubSubTab("kategori")}
                    className={`flex-1 py-3 text-center text-[11px] font-black uppercase tracking-wider transition-all relative ${
                      serviceSubSubTab === "kategori" ? "text-sky-400 font-extrabold" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Kategori
                    {serviceSubSubTab === "kategori" && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceSubSubTab("parfum")}
                    className={`flex-1 py-3 text-center text-[11px] font-black uppercase tracking-wider transition-all relative ${
                      serviceSubSubTab === "parfum" ? "text-sky-400 font-extrabold" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    🧴 Parfum
                    {serviceSubSubTab === "parfum" && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500" />
                    )}
                  </button>
                </div>

                {/* Content Area */}
                {serviceSubSubTab === "layanan" ? (
                  <>
                    {/* Search & Export bar */}
                    <div className="p-3 bg-[#121214]/60 border-b border-zinc-900 flex items-center gap-2 shrink-0 select-none">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Cari nama layanan"
                          value={searchServiceQuery}
                          onChange={(e) => setSearchServiceQuery(e.target.value)}
                          className="w-full text-xs font-semibold bg-[#121214] border border-[#27272A] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-sans"
                        />
                      </div>
                      
                      {/* Sort button */}
                      <button
                        type="button"
                        onClick={() => {
                          setServiceSort((current) => {
                            if (current === 'nama-asc') return 'harga-asc';
                            if (current === 'harga-asc') return 'harga-desc';
                            return 'nama-asc';
                          });
                        }}
                        className="p-2.5 bg-[#121214] border border-[#27272A] rounded-xl flex items-center justify-center text-zinc-300 hover:text-white hover:border-sky-500 transition max-h-[38px]"
                        title={
                          serviceSort === 'nama-asc' ? "Urut: Nama (A-Z)" :
                          serviceSort === 'harga-asc' ? "Urut: Harga Termurah" : "Urut: Harga Termahal"
                        }
                      >
                        <ArrowUpDown className="w-4 h-4" />
                      </button>

                      {/* Export button */}
                      <button
                        type="button"
                        onClick={handleExportServices}
                        className="bg-[#056f2b] hover:bg-emerald-700 text-white text-xs font-black py-2.5 px-3 rounded-xl flex items-center justify-center gap-1 transition max-h-[38px] active:scale-95"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Ekspor</span>
                      </button>
                    </div>

                    {/* Category Filter Chips Scrolling Group */}
                    <div className="px-3 py-2 bg-[#0A0A0B] flex gap-2 overflow-x-auto no-scrollbar border-b border-zinc-900 shrink-0 select-none">
                      {["Semua", ...customServiceCategories.filter(c => c !== "Tanpa Kategori"), "Tanpa Kategori"].map(cat => {
                        const isActive = selectedCategoryChip === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategoryChip(cat)}
                            className={`px-3 py-1.5 rounded-full text-[10.5px] font-black uppercase tracking-wider transition-all duration-150 ${
                              isActive
                                ? "bg-sky-500/15 text-sky-400 border border-sky-400"
                                : "bg-[#121214] border border-[#27272A] text-zinc-400 hover:text-white hover:border-zinc-700"
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>

                    {/* Services list with specific screenshot styling */}
                    <div className="flex-1 overflow-y-auto divide-y divide-[#27272A]/40 bg-[#0A0A0B]">
                      {(() => {
                        // 1. Filter by search query
                        let filtered = services.filter(s => 
                          s.nama.toLowerCase().includes(searchServiceQuery.toLowerCase())
                        );
                        
                        // 2. Filter by Category Chip
                        if (selectedCategoryChip !== "Semua") {
                          if (selectedCategoryChip === "Tanpa Kategori") {
                            filtered = filtered.filter(s => !s.kategori || s.kategori === "Tanpa Kategori" || s.kategori === "Kiloan" || s.kategori.trim() === "");
                          } else {
                            filtered = filtered.filter(s => s.kategori && s.kategori.toLowerCase() === selectedCategoryChip.toLowerCase());
                          }
                        }
                        
                        // Helper for duration formatting
                        const getDurationText = (svc: Service) => {
                          if (svc.durasiTipe && svc.durasiValue) {
                            return `${svc.durasiValue} ${svc.durasiTipe}`;
                          }
                          if (svc.durasiJam >= 24) {
                            return `${Math.round(svc.durasiJam / 24)} Hari`;
                          }
                          return `${svc.durasiJam || 24} Jam`;
                        };

                        // 3. Sort: PINNED item first, then normal sort criterion
                        const sorted = filtered.sort((a, b) => {
                          const aPin = a.sematkan ? 1 : 0;
                          const bPin = b.sematkan ? 1 : 0;
                          if (aPin !== bPin) {
                            return bPin - aPin; // Pinned remains at the top
                          }
                          
                          if (serviceSort === 'nama-asc') {
                            return a.nama.localeCompare(b.nama);
                          } else if (serviceSort === 'harga-asc') {
                            return a.harga - b.harga;
                          } else {
                            return b.harga - a.harga;
                          }
                        });

                        if (sorted.length === 0) {
                          return (
                            <div className="p-10 text-center text-zinc-500">
                              <p className="text-xs">Tidak ada layanan cocok dengan kriteria.</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchServiceQuery("");
                                  setSelectedCategoryChip("Semua");
                                }}
                                className="mt-3 text-xs text-sky-400 hover:underline font-bold font-sans"
                              >
                                Bersihkan filter
                              </button>
                            </div>
                          );
                        }

                        return sorted.map(s => {
                          const processesStr = s.proses && s.proses.length > 0 
                            ? s.proses.join(" - ") 
                            : "Cuci";
                          
                          const unitSuffix = s.tipe === "Kiloan" ? "kg" : (s.tipe === "Satuan" ? "pc" : s.tipe.toLowerCase());
                          const durasiString = getDurationText(s);

                          return (
                            <div 
                              key={s.id} 
                              onClick={() => {
                                setSelectedServiceForAction(s);
                                setShowServiceActionBottomSheet(true);
                              }}
                              className="px-4 py-4 hover:bg-zinc-950/20 active:bg-zinc-950 transition-all flex justify-between items-center cursor-pointer border-b border-zinc-900/60"
                            >
                              {/* Left details */}
                              <div className="space-y-1 pr-4 flex-1">
                                <h3 className="text-white font-semibold text-[13.5px] uppercase tracking-wide group-hover:text-sky-400 duration-150">
                                  {s.nama}
                                </h3>
                                <p className="text-zinc-500 font-semibold text-[10.5px]">
                                  {processesStr}
                                </p>
                              </div>

                              {/* Right details */}
                              <div className="flex items-center gap-2.5 shrink-0 text-right">
                                <div className="space-y-0.5">
                                  <span className="block text-white font-bold text-[13.5px] font-sans">
                                    Rp{s.harga.toLocaleString("id-ID")}<span className="text-[10.5px] font-normal text-zinc-500">/{unitSuffix}</span>
                                  </span>
                                  <div className="flex items-center justify-end gap-1 text-[10.5px] text-zinc-400 font-bold uppercase">
                                    <span>Min. {s.minimalKuantitas || 1} {unitSuffix}</span>
                                    {s.sematkan && (
                                      <Pin className="w-3.5 h-3.5 text-sky-400 fill-sky-400 ml-1" />
                                    )}
                                  </div>
                                  <span className="block text-zinc-500 text-[10.5px] font-medium uppercase font-sans">
                                    {durasiString}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* Bottom options & Tambah Layanan bar */}
                    <div className="p-4 bg-[#121214] border-t border-zinc-900 flex gap-2.5 shrink-0">
                      {/* Three dots menu with global helper operations */}
                      <button
                        type="button"
                        onClick={() => setShowGeneralServiceBottomSheet(true)}
                        className="p-3 bg-zinc-950 hover:bg-zinc-900 border border-[#27272A] hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl transition flex items-center justify-center min-w-[50px] active:scale-95"
                        title="Opsi Layanan"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>

                      {/* Tambah Layanan Blue main button */}
                      <button
                        type="button"
                        onClick={openCreateServiceSubtab}
                        className="flex-1 py-3 bg-[#0284c7] hover:bg-sky-500 text-white text-[12px] uppercase font-black rounded-xl active:scale-95 transition flex items-center justify-center gap-2 tracking-wider"
                      >
                        <Plus className="w-4 h-4 text-white" /> Tambah Layanan
                      </button>
                    </div>
                  </>
                ) : serviceSubSubTab === "kategori" ? (
                  /* Kategori Management sub-tab */
                  <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0b]">
                    {/* Add Category Form */}
                    <div className="p-4 bg-[#121214]/60 border-b border-zinc-900 shrink-0">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Nama Kategori Baru"
                          value={newServiceCategoryInput}
                          onChange={(e) => setNewServiceCategoryInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddServiceCategory()}
                          className="flex-1 text-xs font-semibold bg-[#121214] border border-[#27272A] rounded-xl px-3 py-2.5 text-white placeholder-[#4b5563] focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddServiceCategory}
                          className="px-4 py-2 bg-[#0284c7] hover:bg-sky-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95"
                        >
                          + Kategori
                        </button>
                      </div>
                    </div>

                    {/* Categories Row list */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2">DAFTAR KATEGORI ({customServiceCategories.length})</p>
                      
                      {customServiceCategories.map((cat, idx) => {
                        const count = services.filter(s => s.kategori === cat).length;
                        const isEditing = editingServiceCategoryIndex === idx;

                        return (
                          <div 
                            key={cat} 
                            className="bg-[#121214] border border-[#27272A] rounded-xl p-3 flex justify-between items-center text-xs"
                          >
                            {isEditing ? (
                              <div className="flex items-center gap-2 flex-1 mr-2">
                                <input
                                  type="text"
                                  value={editingServiceCategoryValue}
                                  onChange={(e) => setEditingServiceCategoryValue(e.target.value)}
                                  className="flex-1 text-xs font-semibold bg-[#0A0A0B] border border-[#27272A] rounded-lg px-2 py-1 text-white focus:outline-none focus:border-sky-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateServiceCategory(idx)}
                                  className="px-2 py-1 bg-emerald-600 text-white text-[10px] uppercase font-bold rounded hover:bg-emerald-500"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingServiceCategoryIndex(null)}
                                  className="px-2 py-1 bg-zinc-850 text-zinc-400 text-[10px] uppercase font-bold rounded hover:bg-zinc-800"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <p className="text-white font-bold text-xs uppercase">{cat}</p>
                                  <p className="text-[10px] text-zinc-500 uppercase font-mono mt-0.5">{count} Layanan Terdaftar</p>
                                </div>

                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingServiceCategoryIndex(idx);
                                      setEditingServiceCategoryValue(cat);
                                    }}
                                    className="p-1.5 bg-zinc-950 hover:bg-zinc-900 border border-[#27272A] hover:border-sky-500 text-zinc-400 hover:text-sky-400 rounded-lg transition"
                                    title="Edit Kategori"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={cat === "Tanpa Kategori"}
                                    onClick={() => handleDeleteServiceCategory(idx)}
                                    className="p-1.5 bg-zinc-950 hover:bg-red-950/40 border border-[#27272A] hover:border-red-500/50 text-zinc-400 hover:text-red-400 rounded-lg transition disabled:opacity-30 disabled:pointer-events-none"
                                    title="Hapus Kategori"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Parfum Management sub-tab */
                  <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B]">
                    {/* Add Parfum Form */}
                    <div className="p-4 bg-[#121214]/60 border-b border-zinc-900 shrink-0">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Nama Parfum Baru (contoh: Lavender Sensation)"
                          value={newParfumName}
                          onChange={(e) => setNewParfumName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleAddParfum(newParfumName);
                              setNewParfumName("");
                            }
                          }}
                          className="flex-1 text-xs font-semibold bg-[#121214] border border-[#27272A] rounded-xl px-3 py-2.5 text-white placeholder-[#4b5563] focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            handleAddParfum(newParfumName);
                            setNewParfumName("");
                          }}
                          className="px-4 py-2 bg-[#0284c7] hover:bg-sky-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 flex items-center gap-1"
                        >
                          <span>+ Parfum</span>
                        </button>
                      </div>
                    </div>

                    {/* Parfum List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                          DAFTAR PARFUM ({parfums.length})
                        </p>
                        {parfums.length === 0 && (
                          <button
                            type="button"
                            onClick={handleSeedDefaultParfums}
                            className="text-[9.5px] font-black uppercase tracking-wider text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
                          >
                            ⚡ Klik Utk Isi 7 Parfum Standar
                          </button>
                        )}
                      </div>

                      {parfums.length === 0 ? (
                        <div className="text-center py-10 bg-[#121214] border border-[#27272A] rounded-2xl p-6">
                          <p className="text-zinc-500 text-xs font-medium">Belum ada parfum kustom terdaftar.</p>
                          <p className="text-zinc-600 text-[10px] mt-1 max-w-[240px] mx-auto">
                            Gunakan input di atas untuk membuat parfum sendiri, atau klik tombol standar untuk memuat contoh instan.
                          </p>
                        </div>
                      ) : (
                        parfums.map((p) => {
                          const isEditing = editingParfumId === p.id;

                          return (
                            <div
                              key={p.id}
                              className="bg-[#121214] border border-[#27272A] rounded-xl p-3 flex justify-between items-center text-xs hover:border-zinc-800 transition"
                            >
                              {isEditing ? (
                                <div className="flex items-center gap-2 flex-1 mr-2">
                                  <input
                                    type="text"
                                    value={editingParfumName}
                                    onChange={(e) => setEditingParfumName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleUpdateParfum(p.id, editingParfumName);
                                        setEditingParfumId(null);
                                        setEditingParfumName("");
                                      }
                                    }}
                                    className="flex-1 text-xs font-semibold bg-[#0A0A0B] border border-[#27272A] rounded-lg px-2 py-1 text-white focus:outline-none focus:border-sky-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleUpdateParfum(p.id, editingParfumName);
                                      setEditingParfumId(null);
                                      setEditingParfumName("");
                                    }}
                                    className="px-2 py-1 bg-emerald-600 text-white text-[10px] uppercase font-bold rounded hover:bg-emerald-500 active:scale-95 transition"
                                  >
                                    OK
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingParfumId(null);
                                      setEditingParfumName("");
                                    }}
                                    className="px-2 py-1 bg-zinc-850 text-zinc-400 text-[10px] uppercase font-bold rounded hover:bg-zinc-800"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-zinc-950 flex items-center justify-center text-zinc-450 border border-zinc-900 font-bold">
                                      🧴
                                    </div>
                                    <div>
                                      <p className="text-white font-bold text-xs uppercase tracking-tight">{p.nama}</p>
                                      <p className="text-[10px] text-zinc-550 uppercase font-mono mt-0.5">ID: {p.id}</p>
                                    </div>
                                  </div>

                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingParfumId(p.id);
                                        setEditingParfumName(p.nama);
                                      }}
                                      className="p-1.5 bg-zinc-950 hover:bg-zinc-900 border border-[#27272A] hover:border-sky-500 text-zinc-400 hover:text-sky-400 rounded-lg transition"
                                      title="Edit Nama Parfum"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        triggerConfirm(
                                          "HAPUS PARFUM",
                                          `Apakah Anda yakin ingin menghapus parfum "${p.nama}"? Pilihan ini tidak akan terhapus dari transaksi lampau, namun tidak dapat dipilih untuk order baru.`,
                                          () => handleDeleteParfum(p.id),
                                          true
                                        );
                                      }}
                                      className="p-1.5 bg-zinc-950 hover:bg-red-950/40 border border-[#27272A] hover:border-red-500/50 text-zinc-400 hover:text-red-400 rounded-lg transition"
                                      title="Hapus Parfum"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Inline Drawer/Overlay Modal for Subtab Services CRUD */}
                {isCreatingServiceInSubtab && (
                  <div className="absolute inset-0 bg-black/85 z-40 flex flex-col font-sans animate-fade-in">
                    <div className="p-4 bg-[#121214] border-b border-zinc-900 flex items-center justify-between shrink-0">
                      <span className="text-xs font-black uppercase tracking-wider text-[#38bdf8]">
                        {editingService ? "✎ Edit Layanan" : "★ Buat Layanan Baru"}
                      </span>
                      <button 
                        onClick={() => {
                          setIsCreatingServiceInSubtab(false);
                          setEditingService(null);
                        }} 
                        className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <form onSubmit={handleSaveServiceSubtab} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-16">
                      {/* Name input */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Nama Layanan</label>
                        <input
                          type="text"
                          required
                          value={subtrackServName}
                          onChange={(e) => setSubtrackServName(e.target.value)}
                          placeholder="Contoh: 1 Set Bed Cover Tebal Jumbo"
                          className="w-full text-xs font-semibold bg-[#121214] border border-[#27272A] rounded-xl p-3 text-white placeholder-zinc-650 focus:outline-none focus:border-sky-500 font-sans"
                        />
                      </div>

                      {/* Tipe / Satuan input */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block font-sans">Satuan Unit</label>
                        <select
                          value={subtrackServType}
                          onChange={(e) => setSubtrackServType(e.target.value)}
                          className="w-full text-xs font-bold bg-[#121214] border border-[#27272A] rounded-xl p-3 text-white focus:outline-none focus:border-sky-500 font-sans"
                        >
                          <option value="Kiloan">Kiloan (kg)</option>
                          <option value="Satuan">Satuan (pc)</option>
                          <option value="Meter">Meter (m2)</option>
                          <option value="Set">Set (set)</option>
                          <option value="Pasang">Pasang (pasang)</option>
                          <option value="Lusin">Lusin (lusin)</option>
                        </select>
                      </div>

                      {/* Harga input */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Harga Layanan (Rp)</label>
                        <input
                          type="number"
                          required
                          min="0"
                          value={subtrackServPrice === 0 ? "" : subtrackServPrice}
                          onChange={(e) => setSubtrackServPrice(Number(e.target.value))}
                          placeholder="Contoh: 70000"
                          className="w-full text-xs font-semibold bg-[#121214] border border-[#27272A] rounded-xl p-3 text-white placeholder-zinc-650 focus:outline-none focus:border-sky-500 font-sans"
                        />
                      </div>

                      {/* Durasi & Tipe Durasi (Jam/Hari) */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Estimasi Durasi Selesai</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            required
                            min="1"
                            value={subtrackServDurationValue}
                            onChange={(e) => setSubtrackServDurationValue(Number(e.target.value))}
                            className="w-full text-xs font-semibold bg-[#121214] border border-[#27272A] rounded-xl p-3 text-white focus:outline-none focus:border-sky-500 text-center font-sans"
                          />
                          <select
                            value={subtrackServDurationTipe}
                            onChange={(e) => setSubtrackServDurationTipe(e.target.value as "Jam" | "Hari")}
                            className="w-full text-xs font-bold bg-[#121214] border border-[#27272A] rounded-xl p-3 text-white focus:outline-none focus:border-sky-500 font-sans"
                          >
                            <option value="Jam">Jam</option>
                            <option value="Hari">Hari</option>
                          </select>
                        </div>
                      </div>

                      {/* Proses Laundry Field (Cuci, Pengeringan, Setrika, Lipat) */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block font-sans">Proses Laundry Included</label>
                        <div className="grid grid-cols-2 gap-2">
                          {["Cuci", "Pengeringan", "Setrika", "Lipat"].map((p) => {
                            const isChecked = subtrackServProses.includes(p);
                            return (
                              <button
                                type="button"
                                key={p}
                                onClick={() => {
                                  if (isChecked) {
                                    setSubtrackServProses(subtrackServProses.filter(item => item !== p));
                                  } else {
                                    setSubtrackServProses([...subtrackServProses, p]);
                                  }
                                }}
                                className={`p-2.5 rounded-xl text-xs font-bold border transition text-center font-sans ${
                                  isChecked 
                                    ? "bg-sky-500/15 border-sky-500 text-sky-450" 
                                    : "bg-[#0A0A0B] border-[#27272A] text-zinc-400 hover:bg-zinc-900"
                                }`}
                              >
                                {isChecked ? "✓ " : "+ "} {p}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Minimal kuantitas */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block font-sans">Minimal Kuantitas</label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={subtrackServMinQty}
                          onChange={(e) => setSubtrackServMinQty(Number(e.target.value))}
                          className="w-full text-xs font-semibold bg-[#121214] border border-[#27272A] rounded-xl p-3 text-white focus:outline-none focus:border-sky-500 text-center font-sans"
                        />
                      </div>

                      {/* Kategori Select */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block font-sans">Kategori</label>
                        <select
                          value={subtrackServCategory}
                          onChange={(e) => setSubtrackServCategory(e.target.value)}
                          className="w-full text-xs font-bold bg-[#121214] border border-[#27272A] rounded-xl p-3 text-white focus:outline-none focus:border-sky-500 font-sans"
                        >
                          {customServiceCategories.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      {/* Pin/Sematkan toggle */}
                      <button
                        type="button"
                        onClick={() => setSubtrackServSematkan(!subtrackServSematkan)}
                        className={`w-full py-2.5 border border-dashed rounded-xl text-center text-[10.5px] font-bold tracking-wide transition flex items-center justify-center gap-1.5 font-sans ${
                          subtrackServSematkan 
                            ? "border-sky-500 bg-sky-500/10 text-sky-400" 
                            : "border-[#27272A] hover:bg-zinc-900/40 text-zinc-400"
                        }`}
                      >
                        {subtrackServSematkan ? "★ Disematkan Teratas" : "☆ Sematkan Layanan Teratas"}
                      </button>
                    </form>

                    {/* Action buttons */}
                    <div className="p-4 bg-[#121214] border-t border-zinc-900 flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingServiceInSubtab(false);
                          setEditingService(null);
                        }}
                        className="flex-1 py-3 border border-[#27272A] text-zinc-400 hover:text-white hover:bg-zinc-900 text-xs font-bold rounded-xl active:scale-95 transition"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveServiceSubtab}
                        className="flex-1 py-3 bg-[#0284c7] hover:bg-sky-500 text-white text-xs font-black rounded-xl active:scale-95 transition flex items-center justify-center gap-1 uppercase tracking-wider"
                      >
                        <Save className="w-4 h-4" /> Simpan
                      </button>
                    </div>
                  </div>
                )}

                {/* Service Options Action Bottom Sheet drawer (Screenshot 2 Match) */}
                {showServiceActionBottomSheet && selectedServiceForAction && (
                  <div className="fixed inset-0 bg-black/80 z-60 flex items-end justify-center animate-fade-in font-sans">
                    {/* Click outside to close */}
                    <div 
                      className="absolute inset-0" 
                      onClick={() => {
                        setShowServiceActionBottomSheet(false);
                        setSelectedServiceForAction(null);
                      }}
                    />

                    <div className="w-full max-w-[430px] bg-[#121214] border-t border-zinc-800 rounded-t-3xl overflow-hidden animate-slide-up relative pb-8 p-5 z-70">
                      {/* Drag handle */}
                      <div className="w-12 h-1 bg-zinc-700/65 rounded-full mx-auto mb-6" />
                      
                      {/* Service details */}
                      <div className="mb-6 text-center">
                        <span className="text-[10px] font-black uppercase text-sky-400 tracking-widest block mb-1">Pilihan Layanan</span>
                        <h4 className="text-white font-extrabold text-base uppercase tracking-normal line-clamp-2 px-4">{selectedServiceForAction.nama}</h4>
                        <span className="text-zinc-500 text-[10.5px] font-mono mt-1 block uppercase">Kategori: {selectedServiceForAction.kategori || "Tanpa Kategori"}</span>
                      </div>

                      {/* Choices block */}
                      <div className="space-y-3">
                        {/* Ubah (Edit) */}
                        <button
                          type="button"
                          onClick={() => {
                            const currentSvc = selectedServiceForAction;
                            setShowServiceActionBottomSheet(false);
                            setSelectedServiceForAction(null);
                            openEditServiceSubtab(currentSvc);
                          }}
                          className="w-full p-4 bg-zinc-950/40 hover:bg-zinc-900 border border-[#27272A] hover:border-sky-500 rounded-2xl flex items-center gap-4 text-white transition duration-150 active:scale-98"
                        >
                          <div className="p-2.5 bg-sky-950/80 text-sky-400 rounded-xl">
                            <Edit3 className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <span className="block font-black text-[12.5px] uppercase text-zinc-150 tracking-wide">Ubah / Edit</span>
                            <span className="block text-[10px] text-zinc-500 font-medium">Ubah nama, harga, kategori, minimal kuantitas, estimasi selesai, dll</span>
                          </div>
                        </button>

                        {/* Hapus (Delete) */}
                        <button
                          type="button"
                          onClick={async () => {
                            const currentSvc = selectedServiceForAction;
                            if (window.confirm(`Hapus layanan "${currentSvc.nama}" secara permanen?`)) {
                              await handleDeleteService(currentSvc.id);
                              setShowServiceActionBottomSheet(false);
                              setSelectedServiceForAction(null);
                            }
                          }}
                          className="w-full p-4 bg-red-950/10 hover:bg-red-950/20 border border-red-900/40 rounded-2xl flex items-center gap-4 text-red-400 transition duration-150 active:scale-98"
                        >
                          <div className="p-2.5 bg-red-950/40 text-red-400 rounded-xl">
                            <Trash2 className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <span className="block font-black text-[12.5px] uppercase text-red-400 tracking-wide">Hapus Layanan</span>
                            <span className="block text-[10px] text-red-500/80 font-medium">Hapus layanan ini dari daftar laundry POS secara permanen</span>
                          </div>
                        </button>
                      </div>

                      {/* Cancel Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowServiceActionBottomSheet(false);
                          setSelectedServiceForAction(null);
                        }}
                        className="w-full mt-4 py-3 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white rounded-xl text-xs font-bold uppercase transition active:scale-95"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                {/* General Service Options Bottom Sheet */}
                {showGeneralServiceBottomSheet && (
                  <div className="fixed inset-0 bg-black/80 z-60 flex items-end justify-center animate-fade-in font-sans">
                    <div 
                      className="absolute inset-0" 
                      onClick={() => setShowGeneralServiceBottomSheet(false)}
                    />

                    <div className="w-full max-w-[430px] bg-[#121214] border-t border-zinc-850 rounded-t-3xl overflow-hidden animate-slide-up relative pb-8 p-5 z-70">
                      <div className="w-12 h-1 bg-zinc-700/60 rounded-full mx-auto mb-6" />
                      
                      <div className="mb-5 text-center">
                        <span className="text-[10px] font-black uppercase text-sky-400 tracking-widest block mb-1">Opsi Global</span>
                        <h4 className="text-white font-extrabold text-base uppercase">Pengaturan Layanan</h4>
                      </div>

                      <div className="space-y-3">
                        {/* Option 1: Reload Default seeds if guest or user wanted */}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Apakah Anda yakin ingin memuat ulang 7 layanan laundry bawaan? Tindakan ini tidak akan menghapus layanan yang sudah Anda buat.")) {
                              const defaultList: Service[] = [
                                { id: "serv-bed-jumbo-" + Date.now(), nama: "1 Set Bed Cover Tebal Jumbo", tipe: "Satuan", harga: 70000, durasiJam: 72, proses: ["Cuci", "Pengeringan"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: currentOwnerId || "guest" },
                                { id: "serv-kaos-ab-" + Date.now(), nama: "1 Set Kaos Atas Bawah", tipe: "Satuan", harga: 25000, durasiJam: 4, proses: ["Cuci", "Pengeringan", "Setrika"], minimalKuantitas: 1, kategori: "Express", sematkan: true, userId: currentOwnerId || "guest" },
                                { id: "serv-mukena-" + Date.now(), nama: "1 Set Mukena", tipe: "Satuan", harga: 10000, durasiJam: 48, proses: ["Cuci", "Pengeringan", "Setrika"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: currentOwnerId || "guest" },
                                { id: "serv-seprei-besar-" + Date.now(), nama: "1 Set Seprei Besar", tipe: "Satuan", harga: 25500, durasiJam: 72, proses: ["Cuci", "Pengeringan", "Setrika"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: currentOwnerId || "guest" },
                                { id: "serv-bed-seprei-" + Date.now(), nama: "1 Set Seprei Besar Dan Bed Cover Besar", tipe: "Satuan", harga: 50000, durasiJam: 72, proses: ["Cuci", "Pengeringan"], minimalKuantitas: 1, kategori: "Reguler", sematkan: true, userId: currentOwnerId || "guest" }
                              ];
                              // Add batch
                              setServices(prev => {
                                const base = [...prev];
                                defaultList.forEach(d => {
                                  if (!base.some(b => b.nama.toLowerCase() === d.nama.toLowerCase())) {
                                    base.unshift(d);
                                  }
                                });
                                return base;
                              });
                              setShowGeneralServiceBottomSheet(false);
                            }
                          }}
                          className="w-full p-4 bg-zinc-950/40 hover:bg-zinc-900 border border-[#27272A] rounded-2xl flex items-center gap-4 text-white transition duration-150 active:scale-98"
                        >
                          <div className="p-2.5 bg-sky-950/80 text-sky-400 rounded-xl">
                            <Save className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <span className="block font-black text-[12.5px] uppercase text-zinc-200 tracking-wide">Muat Ulang Layanan Bawaan</span>
                            <span className="block text-[10px] text-zinc-500 font-medium font-sans">Tambahkan kembali template Bed Cover, Seprei, & Kaos ke database</span>
                          </div>
                        </button>

                        {/* Option 2: Hapus semua */}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Peringatan Keras! Apakah Anda benar-benar mau menghapus SEMUA layanan terdaftar? Tindakan ini tidak dapat dibatalkan!")) {
                              setServices([]);
                              setShowGeneralServiceBottomSheet(false);
                            }
                          }}
                          className="w-full p-4 bg-red-950/10 hover:bg-red-950/20 border border-red-900/40 rounded-2xl flex items-center gap-4 text-red-500 transition duration-150 active:scale-98"
                        >
                          <div className="p-2.5 bg-red-950/40 text-red-400 rounded-xl">
                            <Trash2 className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <span className="block font-black text-[12.5px] uppercase text-red-400 tracking-wide">Hapus Semua Layanan</span>
                            <span className="block text-[10px] text-red-500/80 font-medium font-sans">Hapus total seluruh produk layanan laundry Anda bersih polos</span>
                          </div>
                        </button>
                      </div>

                      {/* Cancel Button */}
                      <button
                        type="button"
                        onClick={() => setShowGeneralServiceBottomSheet(false)}
                        className="w-full mt-4 py-3 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white rounded-xl text-xs font-bold uppercase transition active:scale-95"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        
        {activeTab === "transaksi" && (
          <LaundryTransactions
            transactions={transactions}
            customers={customers}
            services={services}
            parfums={parfums}
            activeOwnerId={currentOwnerId || "guest"}
            activeCashierName={
              loggedInKaryawan ? loggedInKaryawan.nama :
              loggedInAdmin ? loggedInAdmin.nama :
              loggedInOwner ? (loggedInOwner.displayName || loggedInOwner.email.split("@")[0]) :
              user ? (user.displayName || user.email?.split("@")[0] || "User") :
              "Mba Dwi"
            }
            isOwner={!!user || !!loggedInOwner || isGuestSession}
            onAddTransaction={handleAddTransaction}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onAddCustomer={handleAddCustomer}
            onAddService={handleAddService}
            onUpdateCustomer={handleUpdateCustomer}
            onAddParfum={handleAddParfum}
            showCreateModalDirectly={directOpenCreateTrx}
            onCloseCreateModalDirectly={() => {
              setDirectOpenCreateTrx(false);
              setActiveTab(previousTab || "dashboard");
            }}
            showCustomerModalDirectly={directOpenCreateCust}
            onCloseCustomerModalDirectly={() => setDirectOpenCreateCust(false)}
            showServiceModalDirectly={directOpenCreateServ}
            onCloseServiceModalDirectly={() => setDirectOpenCreateServ(false)}
            triggerConfirm={triggerConfirm}
            initialDateFilter={trxDateFilter}
            initialSelectedTrxId={trxSelectedDetailTrxId}
            initialSpecialFilter={trxSpecialFilter}
            onClearInitialFilters={() => {
              setTrxDateFilter("");
              setTrxSpecialFilter("");
              setTrxSelectedDetailTrxId(null);
            }}
            onViewCustomerProfile={(c) => {
              setSelectedCustomerProfile(c);
              setTopupAmount("");
              setSelectedPastTrxInProfile(null);
              setProfileShowUnpaid(false);
              setProfileShowAll(false);
              setShowCustomerProfileModal(true);
            }}
          />
        )}

        {activeTab === "laporan" && (
          <LaundryReports
            transactions={transactions}
            employees={karyawans}
            services={services}
            customers={customers}
            onBack={() => setActiveTab("dashboard")}
            onSelectTransaction={(trxId) => {
              setTrxDateFilter("");
              setTrxSpecialFilter("");
              setTrxSelectedDetailTrxId(trxId);
              setActiveTab("transaksi");
            }}
          />
        )}

        {activeTab === "advisor" && (
          loggedInAdmin ? (
            <div className="flex-1 flex flex-col bg-[#0A0A0B] text-zinc-100 animate-fade-in font-sans overflow-hidden">
              {/* Header */}
              <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-[#27272A] bg-[#0C0C0E]">
                <h1 className="text-base font-black tracking-wider text-center flex-1 text-white">Profil Akun Admin</h1>
              </div>

              {/* Scrollable Container */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 text-left">
                {/* 1. Account Avatar & Display Name Card */}
                <div className="bg-[#121214] border border-[#27272A] p-5 rounded-xl flex flex-col items-center text-center space-y-3 relative overflow-hidden shadow-xl">
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-sky-500" />
                  <div className="w-16 h-16 bg-sky-500 rounded-full flex items-center justify-center font-black text-2xl text-white shadow-md uppercase">
                    {loggedInAdmin.nama.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white leading-tight">{loggedInAdmin.nama}</h2>
                    <p className="text-xs text-zinc-400 font-semibold mt-0.5">@{loggedInAdmin.username}</p>
                  </div>
                  <span className="inline-block text-[10px] font-black text-[#10B981] bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-900 uppercase tracking-wider font-mono">
                    🛡️ ADMIN LAUNDRY
                  </span>
                </div>

                {/* 2. Detail Information Grid */}
                <div className="bg-[#121214] border border-[#27272A] p-4 rounded-xl space-y-3">
                  <h3 className="text-xs font-black text-sky-400 tracking-wider uppercase mb-1">Informasi Akun</h3>
                  
                  <div className="flex justify-between items-center py-2 border-b border-zinc-900 text-xs">
                    <span className="text-zinc-400 font-semibold">Username</span>
                    <span className="text-white font-mono font-bold">{loggedInAdmin.username}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-zinc-900 text-xs">
                    <span className="text-zinc-400 font-semibold">Nama Lengkap</span>
                    <span className="text-white font-bold">{loggedInAdmin.nama}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-zinc-900 text-xs">
                    <span className="text-zinc-400 font-semibold">Tipe Akun</span>
                    <span className="text-white font-bold">Staf Kasir / Operasional</span>
                  </div>

                  <div className="flex justify-between items-center py-2 text-xs">
                    <span className="text-zinc-400 font-semibold">ID Owner Utama</span>
                    <span className="text-zinc-300 font-mono text-[10px] truncate max-w-[150px]">{loggedInAdmin.ownerId}</span>
                  </div>
                </div>

                {/* 3. System Preferences & Status Card */}
                <div className="bg-[#121214] border border-[#27272A] p-4 rounded-xl space-y-3">
                  <h3 className="text-xs font-black text-sky-400 tracking-wider uppercase mb-1">Sistem & Konektivitas</h3>

                  <div className="flex justify-between items-center py-1 text-xs">
                    <div className="flex flex-col">
                      <span className="text-white font-bold">Status Printer Bluetooth</span>
                      <span className="text-[10px] text-zinc-500 font-medium">{headerPrinterDeviceName || "Tidak ada perangkat terhubung"}</span>
                    </div>
                    <span className={`inline-block text-[9px] font-black px-2.5 py-1 uppercase rounded-full tracking-wider font-mono ${
                      headerPrinterConnected 
                        ? "bg-emerald-950/40 text-[#10B981] border border-emerald-900" 
                        : "bg-zinc-850 text-zinc-455"
                    }`}>
                      {headerPrinterConnected ? "TERKONEKSI" : "DISCONNECTED"}
                    </span>
                  </div>
                </div>

                {/* 4. Action buttons */}
                <div className="pt-2 space-y-3">
                  <button
                    onClick={handleAdminSignOut}
                    className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs rounded-xl cursor-pointer shadow-lg active:scale-95 transition-all text-center uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    Keluar dari Akun Admin
                  </button>

                  <p className="text-center text-[10px] text-zinc-500 font-bold tracking-wide uppercase">
                    DamDam Laundry v2.0 • Seluruh aktivitas dicatat sistem
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <AiAssistant
              expenses={expenses}
              budgetLimit={budgetLimit}
              transactions={transactions}
              customers={customers}
              services={services}
              onNavigateToData={handleNavigateToData}
            />
          )
        )}
      </main>


      {/* 3. SIMULATED OS APP BOTTOM NAVIGATION TAB BAR */}
      <nav className="w-full h-[calc(4rem+env(safe-area-inset-bottom,0px))] bg-[#121214] border-t border-[#27272A] flex items-center justify-around select-none shrink-0 z-40 px-2 pt-1.5 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))] md:h-16 md:pb-1 md:pt-0">
        {/* Tab 1: Home / POS dashboard */}
        <button
          onClick={() => {
            setActiveTab("dashboard");
            setDashboardSubTab("home");
          }}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-all cursor-pointer relative ${
            activeTab === "dashboard" && dashboardSubTab === "home"
              ? "text-emerald-400 font-black bg-zinc-900/50"
              : "text-zinc-500 hover:text-zinc-300 font-bold"
          }`}
        >
          {activeTab === "dashboard" && dashboardSubTab === "home" && (
            <div className="absolute top-0 w-6 h-0.5 bg-emerald-500 rounded-full" />
          )}
          <LayoutDashboard className={`w-5 h-5 ${activeTab === "dashboard" && dashboardSubTab === "home" ? "stroke-[2.5px] text-emerald-400" : "stroke-2"}`} />
          <span className="text-[9px] mt-0.5 tracking-wider uppercase font-black">Dashboard</span>
        </button>

        {/* Tab 2: Nota Transaksi list */}
        <button
          onClick={() => {
            setTrxDateFilter("");
            setTrxSpecialFilter("");
            setTrxSelectedDetailTrxId(null);
            setDirectOpenCreateTrx(false);
            setDirectOpenCreateCust(false);
            setDirectOpenCreateServ(false);
            setActiveTab("transaksi");
          }}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-all cursor-pointer relative ${
            activeTab === "transaksi" && !directOpenCreateTrx
              ? "text-emerald-400 font-black bg-zinc-900/50"
              : "text-zinc-500 hover:text-zinc-300 font-bold"
          }`}
        >
          {activeTab === "transaksi" && !directOpenCreateTrx && (
            <div className="absolute top-0 w-6 h-0.5 bg-emerald-500 rounded-full" />
          )}
          <Receipt className={`w-5 h-5 ${activeTab === "transaksi" && !directOpenCreateTrx ? "stroke-[2.5px] text-emerald-400" : "stroke-2"}`} />
          <span className="text-[9px] mt-0.5 tracking-wider uppercase font-black">Transaksi</span>
        </button>

        {/* Dynamic Big Middle Circular Plus Button for Quick Invoice Creation */}
        <div className="flex items-center justify-center -mt-6 relative z-50">
          <button
            onClick={() => {
              setPreviousTab(activeTab);
              setActiveTab("transaksi");
              setDirectOpenCreateTrx(true);
            }}
            id="btn_quick_create_trx"
            title="Sakti: Buat Nota Baru"
            className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black active:scale-90 transition-all duration-150 flex items-center justify-center shadow-lg shadow-emerald-500/20 border-4 border-zinc-950 relative group cursor-pointer"
          >
            {/* Soft pulsing border glow */}
            <span className="absolute -inset-1 rounded-full bg-emerald-500/30 blur opacity-40 group-hover:opacity-80 duration-150 animate-pulse" />
            <Plus className="w-8 h-8 stroke-[3.5px] text-zinc-950 relative z-10" />
          </button>
        </div>

        {/* Tab 3: Monthly Reports dashboard */}
        <button
          onClick={() => {
            if (loggedInAdmin) {
              alert("Akses Ditolak: Peran Admin tidak memiliki izin untuk membuka menu Laporan.");
              return;
            }
            setActiveTab("laporan");
          }}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-all cursor-pointer relative ${
            loggedInAdmin ? "opacity-30 cursor-not-allowed" : ""
          } ${
            activeTab === "laporan"
              ? "text-emerald-400 font-black bg-zinc-900/50"
              : "text-zinc-500 hover:text-zinc-300 font-bold"
          }`}
        >
          {activeTab === "laporan" && (
            <div className="absolute top-0 w-6 h-0.5 bg-emerald-500 rounded-full" />
          )}
          <FileText className={`w-5 h-5 ${activeTab === "laporan" ? "stroke-[2.5px] text-emerald-400" : "stroke-2"}`} />
          <span className="text-[9px] mt-0.5 tracking-wider uppercase font-black">{loggedInAdmin ? "🔒 Laporan" : "Laporan"}</span>
        </button>

        {/* Tab 4: AI chatbot Advisor or Profile */}
        <button
          onClick={() => setActiveTab("advisor")}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-all cursor-pointer relative ${
            activeTab === "advisor"
              ? "text-emerald-400 font-black bg-zinc-900/50"
              : "text-zinc-500 hover:text-zinc-300 font-bold"
          }`}
        >
          {activeTab === "advisor" && (
            <div className="absolute top-0 w-6 h-0.5 bg-emerald-500 rounded-full" />
          )}
          <div className="relative">
            {loggedInAdmin ? (
              <UserIcon className={`w-5 h-5 ${activeTab === "advisor" ? "stroke-[2.5px] text-emerald-400" : "stroke-2"}`} />
            ) : (
              <>
                <Bot className={`w-5 h-5 ${activeTab === "advisor" ? "stroke-[2.5px] text-emerald-400" : "stroke-2"}`} />
                {activeTab !== "advisor" && (
                  <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse border border-zinc-900" />
                )}
              </>
            )}
          </div>
          <span className="text-[9px] mt-0.5 tracking-wider uppercase font-black">
            {loggedInAdmin ? "Profil" : "Damdam AI"}
          </span>
        </button>
      </nav>

      {/* 4. Beautiful scanner overlay modal for direct Testing on Mobile */}
      {showMobileModal && (
        <div className="absolute inset-0 bg-[#0A0A0B]/98 z-50 flex flex-col justify-between p-6 animate-fade-in font-sans">
          
          {/* Header */}
          <div className="border-b border-[#27272A] pb-3 text-left">
            <h2 className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" /> BUKA INSTAN DI HANDPHONE
            </h2>
            <p className="text-[10px] text-zinc-400 uppercase font-black tracking-wider mt-1">
              Rasakan demo aplikasi langsung di perangkat Android / iOS Anda!
            </p>
          </div>

          {/* Core Content - QR Code */}
          <div className="flex-1 flex flex-col items-center justify-center py-4 space-y-4">
            <div className="p-3 bg-[#121214] border border-[#27272A] shadow-lg relative flex items-center justify-center">
              {/* Scan target lines decoration */}
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-emerald-500" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-emerald-500" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-emerald-500" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-emerald-500" />
              
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=10b981&bgcolor=121214&data=${encodeURIComponent(sharedUrl)}`}
                alt="QR Code"
                className="w-40 h-40 filter brightness-110"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Instruction Lists */}
            <div className="space-y-2 max-w-[280px] text-left">
              <div className="flex items-start gap-2.5 text-[10px] text-zinc-400 font-semibold leading-relaxed">
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 font-mono text-[9px] w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span>Buka aplikasi <strong className="text-white">Kamera</strong> bawaan di HP Android atau iPhone Anda.</span>
              </div>
              <div className="flex items-start gap-2.5 text-[10px] text-zinc-400 font-semibold leading-relaxed">
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 font-mono text-[9px] w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span>Arahkan kamera ke <strong className="text-emerald-400 uppercase">KODE QR EMERALD</strong> di atas.</span>
              </div>
              <div className="flex items-start gap-2.5 text-[10px] text-zinc-400 font-semibold leading-relaxed">
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 font-mono text-[9px] w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span>Ketuk spanduk/tautan pop-up yang muncul di layar HP Anda untuk langsung membukanya!</span>
              </div>
            </div>
          </div>

          {/* Copy input text box fallback */}
          <div className="bg-[#121214] border border-[#27272A] p-3 text-left space-y-2 shrink-0">
            <span className="block text-[8.5px] font-black text-zinc-500 uppercase tracking-widest">
              Atau Salin & Buka URL Browser HP:
            </span>
            <div className="flex gap-1.5">
              <input
                type="text"
                readOnly
                value={sharedUrl}
                className="flex-1 bg-zinc-950 border border-[#27272A] px-2.5 py-1.5 text-[9px] text-zinc-300 font-mono rounded-none focus:outline-none"
              />
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 bg-zinc-950 border border-[#27272A] hover:border-emerald-500 text-zinc-400 hover:text-white transition-all rounded-none text-[9.5px] font-black uppercase flex items-center gap-1 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Salin</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Link to Install Guide */}
          <button
            type="button"
            onClick={() => {
              setShowMobileModal(false);
              setShowInstallGuide(true);
            }}
            className="w-full py-2 bg-[#0C1F16] border border-emerald-900/60 hover:border-emerald-500 text-emerald-400 font-extrabold text-[9.5px] uppercase tracking-wider rounded-none transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 active:scale-98"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span>Punya masalah saat install di HP? Baca Panduan</span>
          </button>

          {/* Bottom Close Button */}
          <button
            onClick={() => setShowMobileModal(false)}
            className="w-full mt-3 py-3 bg-emerald-500 hover:bg-emerald-450 text-black text-xs font-black tracking-widest uppercase rounded-none transition-all cursor-pointer shadow-md text-center active:scale-98 shrink-0"
          >
            KEMBALI KE APLIKASI
          </button>
        </div>
      )}

      {/* 4.3b Custom WhatsApp Billing Modal Overlay */}
      {showWaBillModal && selectedCustomerProfile && (() => {
        const c = selectedCustomerProfile;
        
        // Find unpaid/DP transactions
        const customerTransactions = transactions.filter(t => 
          (t.customerName === c.nama || t.customerPhone === c.telepon)
        );
        const unpaidTransactions = customerTransactions.filter(t => 
          (t.statusBayar === "Belum Lunas" || t.statusBayar === "DP") && t.status !== "Batal"
        );
        const totalSisa = unpaidTransactions.reduce((acc, t) => {
          if (t.statusBayar === "Belum Lunas") {
            return acc + t.totalHarga;
          } else {
            return acc + Math.max(0, t.totalHarga - (t.dpAmount || 0));
          }
        }, 0);

        const renderWhatsAppMessagePreview = (text: string) => {
          if (!text) return null;
          
          return text.split("\n").map((line, idx) => {
            const boldRegex = /\*([^*]+)\*/g;
            const safeLine = line
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(boldRegex, "<strong>$1</strong>");
              
            return (
              <div 
                key={idx} 
                className="min-h-[1.2rem]"
                dangerouslySetInnerHTML={{ __html: safeLine }} 
              />
            );
          });
        };

        return (
          <div className="absolute inset-0 bg-[#0A0A0B]/98 z-55 flex flex-col p-6 animate-fade-in font-sans text-left overflow-hidden">
            {/* Header */}
            <div className="border-b border-[#27272A] pb-3 shrink-0 flex justify-between items-center">
              <div>
                <h2 className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5 leading-tight">
                  <MessageSquare className="w-4 h-4 text-emerald-500 shrink-0" /> KIRIM RINCIAN TAGIHAN KE WHATSAPP
                </h2>
                <p className="text-[9.5px] text-zinc-400 uppercase font-black tracking-wider mt-1">
                  Format template otomatis saringan piutang pelanggan
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowWaBillModal(false);
                  setIsManuallyEdited(false);
                }}
                className="p-1 px-2.5 bg-zinc-90 w-auto hover:bg-[#1C1C1E] border border-zinc-850 hover:border-emerald-500 text-zinc-400 hover:text-white text-[9.5px] font-black uppercase rounded-none duration-150 cursor-pointer"
              >
                TUTUP
              </button>
            </div>

            {/* Split layout: Form Editor & Chat Preview */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 md:space-y-0 md:flex md:gap-4 select-none">
              
              {/* Left Column: Editable parameters & live draft */}
              <div className="flex-1 flex flex-col gap-4">
                
                {/* Parameters block */}
                <div className="bg-[#121214] border border-[#27272A] p-4 space-y-3 shrink-0">
                  <span className="block text-emerald-400 font-extrabold uppercase text-[9px] tracking-wide border-b border-zinc-900 pb-1.5">
                    ⚙️ ATUR DATA TAGIHAN
                  </span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Due Date Picker */}
                    <div>
                      <label className="text-[8.5px] text-zinc-400 font-black uppercase block mb-1">
                        Batas Pembayaran:
                      </label>
                      <input
                        type="date"
                        value={waBillDueDate}
                        onChange={(e) => {
                          setWaBillDueDate(e.target.value);
                          setIsManuallyEdited(false);
                        }}
                        className="w-full text-xs bg-zinc-950 border border-zinc-800 focus:border-emerald-500 text-white p-2 outline-none rounded-none font-mono font-bold"
                      />
                    </div>

                    {/* Payment Method Option */}
                    <div>
                      <label className="text-[8.5px] text-zinc-400 font-black uppercase block mb-1">
                        Metode Transfer:
                      </label>
                      <input
                        type="text"
                        placeholder="QRIS, Transfer BCA dsb"
                        value={waBillPaymentMethod}
                        onChange={(e) => {
                          setWaBillPaymentMethod(e.target.value);
                          setIsManuallyEdited(false);
                        }}
                        className="w-full text-xs bg-zinc-950 border border-zinc-800 focus:border-emerald-500 text-white p-2 outline-none rounded-none font-sans font-bold"
                      />
                    </div>
                  </div>

                  {/* Notes template input */}
                  <div>
                    <label className="text-[8.5px] text-zinc-400 font-black uppercase block mb-1">
                      Catatan Tambahan (Note):
                    </label>
                    <input
                      type="text"
                      placeholder="Mohon konfirmasi jika sudah lunas..."
                      value={waBillNotes}
                      onChange={(e) => {
                        setWaBillNotes(e.target.value);
                        setIsManuallyEdited(false);
                      }}
                      className="w-full text-xs bg-zinc-950 border border-zinc-800 focus:border-emerald-500 text-white p-2 outline-none rounded-none font-sans font-bold"
                    />
                  </div>
                </div>

                {/* Draft text compiler */}
                <div className="bg-[#121214] border border-[#27272A] p-4 flex-1 flex flex-col min-h-[160px]">
                  <div className="flex justify-between items-center border-b border-zinc-900 pb-2 mb-2 shrink-0">
                    <span className="text-emerald-400 font-extrabold uppercase text-[9px] tracking-wide">
                      ✍️ ISI DRAFT CHAT (KLIK DI BAWAH UNTUK EDIT MANDIRI)
                    </span>
                    {isManuallyEdited && (
                      <button 
                        onClick={() => {
                          setIsManuallyEdited(false);
                        }}
                        className="text-[8.5px] bg-[#0E1F16] hover:bg-[#143F24] text-emerald-400 px-1.5 py-0.5 font-black uppercase border border-emerald-900 rounded-none cursor-pointer"
                      >
                        SINKRON ULANG
                      </button>
                    )}
                  </div>
                  
                  <textarea
                    value={customWaText}
                    onChange={(e) => {
                      setCustomWaText(e.target.value);
                      setIsManuallyEdited(true);
                    }}
                    className="w-full flex-1 text-xs bg-zinc-950 border border-zinc-900 focus:border-emerald-500/80 p-3 text-zinc-200 font-mono outline-none leading-relaxed rounded-none resize-none"
                    placeholder="Tulis draf pesan WhatsApp..."
                  />
                  <span className="text-[8px] text-zinc-500 uppercase font-mono mt-2 block">
                    👉 Gunakan tanda bintang (*) di awal & akhir kalimat draf untuk menebalkan teks di WhatsApp.
                  </span>
                </div>

              </div>

              {/* Right Column: Beautiful simulated iOS/Android WhatsApp chat preview */}
              <div className="flex-1 flex flex-col bg-[#071F13]/20 border border-emerald-950/60 p-4 rounded-none h-full relative">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px]" />
                
                <span className="block text-emerald-400 font-extrabold uppercase text-[9px] tracking-widest border-b border-emerald-950/40 pb-2 mb-3 shrink-0">
                  💬 LIVE PREVIEW CHAT WHATSAPP
                </span>

                {/* Simulated Conversation background */}
                <div className="flex-1 overflow-y-auto bg-zinc-950/90 border border-zinc-900 p-4 rounded-none flex flex-col justify-start select-text min-h-[220px]">
                  
                  {/* WhatsApp speech bubble from "Me" */}
                  <div className="self-end bg-[#0B5E34] text-white p-3 rounded-md rounded-tr-none text-[11px] leading-relaxed max-w-[85%] shadow-md border border-[#0F8349]/30 text-left font-sans select-all select-text">
                    {/* Rendered markdown style format */}
                    <div className="space-y-0.5">
                      {renderWhatsAppMessagePreview(customWaText)}
                    </div>
                    
                    {/* Simulated details */}
                    <div className="flex items-center justify-end gap-1 mt-1 text-[8px] text-emerald-200/80 font-mono leading-none">
                      <span>{new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                      <svg className="w-3 h-3 fill-current text-sky-400" viewBox="0 0 24 24">
                        <path d="M0.41 13.41L6 19l1.41-1.42-5.58-5.58L0.41 13.41m22.24-8.08L10.5 17.48 6.42 13.4l-1.42 1.41 5.5 5.5 13.5-13.5-1.75-1.48m-5.83 5.4l-1.43-1.41-6.17 6.17 1.42 1.41 6.18-6.17z"/>
                      </svg>
                    </div>
                  </div>

                </div>

                {/* Launcher Button footer */}
                <div className="pt-4 border-t border-emerald-950/50 space-y-2 shrink-0">
                  <a
                    href={`https://api.whatsapp.com/send?phone=${c.telepon.replace(/[^0-9]/g, "")}&text=${encodeURIComponent(customWaText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      setShowWaBillModal(false);
                      setIsManuallyEdited(false);
                    }}
                    className="w-full py-3 bg-[#10B981] hover:bg-emerald-400 text-black font-sans font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg active:scale-98 flex items-center justify-center gap-2 text-center"
                  >
                    <Smartphone className="w-4 h-4 text-black animate-bounce" />
                    <span>LUNCURKAN KE WA PELANGGAN</span>
                  </a>
                  
                  <p className="text-[8px] text-zinc-400 max-w-sm mx-auto leading-relaxed text-center font-semibold">
                    💡 Browser Anda akan meluncurkan chat WhatsApp eksternal dengan draf format pesan lengkap yang siap dikirimkan.
                  </p>
                </div>

              </div>

            </div>
          </div>
        );
      })()}

      {/* 4.4 PWA Installation Guide modal overlay */}
      {showInstallGuide && (
        <div className="absolute inset-0 bg-[#0A0A0B]/98 z-55 flex flex-col justify-between p-6 animate-fade-in font-sans text-left">
          
          {/* Header */}
          <div className="border-b border-[#27272A] pb-3 shrink-0">
            <h2 className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5 leading-tight">
              <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" /> PANDUAN MANUAL INSTALASI DI HANDPHONE
            </h2>
            <p className="text-[10px] text-zinc-400 uppercase font-black tracking-wider mt-1">
              Panduan instalasi mandiri PWA Damdam Laundry untuk Android & iOS!
            </p>
          </div>

          {/* Body Scroll Area */}
          <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
            
            {/* Explanation box */}
            <div className="bg-[#121214] border border-[#27272A] p-3 text-zinc-400 text-[10.5px] leading-relaxed">
              <span className="block text-emerald-400 font-extrabold uppercase mb-1 text-[9px] tracking-wide">💡 INFO PENTING: KONEKSI PREVIEW TERPROTEKSI</span>
              Karena URL sandbox/preview AI Studio ini dilindungi oleh otentikasi Google Login, Google Chrome secara otomatis mematikan tombol Pasang/Install otomatis. Ini adalah tindakan keamanan browser standar.
              <p className="mt-1.5 text-white font-semibold">
                Namun jangan khawatir, Anda <strong>TETAP BISA</strong> memasangnya di layar utama HP secara manual dengan 3 langkah mudah berikut yang aman & 100% Berhasil!
              </p>
            </div>

            {/* Android steps */}
            <div className="bg-[#121214] border-l-2 border-l-emerald-500 border border-[#27272A] p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-white bg-emerald-950 border border-emerald-900 px-1.5 py-0.5 rounded-none uppercase">HP ANDROID</span>
                <span className="text-[9px] text-zinc-400 font-bold uppercase">(Google Chrome)</span>
              </div>
              <ul className="space-y-1.5 text-zinc-300 pl-1 text-[11px] font-medium leading-relaxed font-sans">
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-black">1.</span>
                  <span>Buka tautan website preview ini di browser <strong>Google Chrome</strong> di HP Anda.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-black">2.</span>
                  <span>Ketuk tombol menu <strong>titik tiga (⋮)</strong> di kanan atas layar Chrome HP Anda.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-black">3.</span>
                  <span>Pilih opsi <strong className="text-emerald-400 font-extrabold uppercase">"Tambahkan ke Layar Utama" (Add to Home Screen)</strong> atau <strong className="text-emerald-400 font-extrabold uppercase">"Instal Aplikasi"</strong>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-black">4.</span>
                  <span>Aplikasi akan diunduh & terpasang di HP Anda dengan Logo Damdam Laundry asli.</span>
                </li>
              </ul>
            </div>

            {/* iOS steps */}
            <div className="bg-[#121214] border-l-2 border-l-cyan-500 border border-[#27272A] p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black bg-cyan-950 border border-cyan-900 px-1.5 py-0.5 rounded-none uppercase text-cyan-300">HP IPHONE (iOS)</span>
                <span className="text-[9px] text-zinc-400 font-bold uppercase">(Safari Browser)</span>
              </div>
              <ul className="space-y-1.5 text-zinc-300 pl-1 text-[11px] font-medium leading-relaxed font-sans">
                <li className="flex gap-2">
                  <span className="text-cyan-400 font-black">1.</span>
                  <span>Buka tautan website preview ini di browser bawaan <strong>Safari</strong> iPhone.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-cyan-400 font-black">2.</span>
                  <span>Ketuk tombol <strong className="text-white">Bagikan (Share)</strong> yang berikon kotak dengan panah ke atas (📤) di panel bawah Safari.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-cyan-400 font-black">3.</span>
                  <span>Gulir ke bawah dan ketuk opsi <strong className="text-cyan-400 font-extrabold uppercase">"Tambahkan ke Layar Utama" (Add to Home Screen)</strong>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-cyan-400 font-black">4.</span>
                  <span>Selesai! Aplikasi Damdam Laundry akan langsung muncul di beranda iOS Anda.</span>
                </li>
              </ul>
            </div>

            {/* Deploy Info note */}
            <div className="bg-emerald-950/20 border border-emerald-950/60 p-3 rounded-none text-[9.5px] text-zinc-400 leading-normal">
              <strong>🚀 Setelah Deploy ke Cloud Run (Produksi):</strong> Anda & karyawan tidak perlu melakukan ini lagi! Tombol install otomatis Google Chrome akan langsung aktif karena website bebas dijangkau publik tanpa login keamanan Google.
            </div>

          </div>

          {/* Interactive Install button if prompt caught */}
          <div className="pt-3 border-t border-[#27272A] space-y-2.5 shrink-0">
            {isInstallable && (
              <button
                type="button"
                onClick={triggerPwaInstall}
                className="w-full py-3 bg-[#10B981] hover:bg-emerald-400 text-black font-mono font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg active:scale-98 flex items-center justify-center gap-1.5"
              >
                <Smartphone className="w-4 h-4 text-black animate-bounce shrink-0" />
                <span>PASANG SECARA OTOMATIS</span>
              </button>
            )}

            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-[#27272A] text-white text-xs font-black tracking-widest uppercase rounded-none transition-all cursor-pointer text-center active:scale-98"
            >
              KEMBALI / TUTUP PANDUAN
            </button>
          </div>
        </div>
      )}

      {/* 4.5. Premium Bluetooth Printer settings panel overlay */}
      {showPrinterModal && (
        <BluetoothPrinterModal 
          onClose={() => setShowPrinterModal(false)} 
          activeCashierName={loggedInKaryawan?.nama || "Admin"}
        />
      )}

      {/* Modal Edit Pelanggan */}
      {showEditCustomerModal && selectedCustomerForEdit && (
        <div className="absolute inset-0 bg-[#0A0A0B]/90 backdrop-blur-xs z-55 flex items-center justify-center p-4 font-sans text-left">
          <div 
            className="absolute inset-0" 
            onClick={() => {
              setShowEditCustomerModal(false);
              setSelectedCustomerForEdit(null);
            }}
          />

          <div className="w-full max-w-[340px] bg-[#121214] border border-[#27272A] p-5 shadow-2xl relative z-70 text-left animate-scale-up rounded-none">
            {/* Corner Deco */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-emerald-500" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-emerald-500" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500" />

            <div className="flex justify-between items-center mb-4 border-b border-zinc-900 pb-2.5">
              <div>
                <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider block">DATABASE PELANGGAN</span>
                <h4 className="text-white font-extrabold text-[13px] uppercase">Ubah Pelanggan</h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditCustomerModal(false);
                  setSelectedCustomerForEdit(null);
                }}
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-none transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">ID Pelanggan (Tetap):</label>
                <input
                  type="text"
                  disabled
                  value={selectedCustomerForEdit.id}
                  className="w-full text-[11px] bg-zinc-950 border border-zinc-900 rounded-none text-zinc-500 p-2 font-mono cursor-not-allowed select-none"
                />
              </div>

              <div>
                <label className="text-[9.5px] text-zinc-350 font-black uppercase block mb-1">Nama Pelanggan <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g., Ibu Fatimah"
                  value={editCustomerName}
                  onChange={(e) => setEditCustomerName(e.target.value)}
                  className="w-full text-xs bg-zinc-900 border border-[#27272A] text-white p-2 outline-none focus:border-emerald-500 rounded-none font-sans"
                  required
                />
              </div>

              <div>
                <label className="text-[9.5px] text-zinc-350 font-black uppercase block mb-1">Nomor WhatsApp / HP <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  placeholder="e.g., 0812345678"
                  value={editCustomerPhone}
                  onChange={(e) => setEditCustomerPhone(e.target.value)}
                  className="w-full text-xs bg-zinc-900 border border-[#27272A] text-white p-2 outline-none focus:border-emerald-500 font-mono rounded-none"
                  required
                />
              </div>

              <div>
                <label className="text-[9.5px] text-zinc-350 font-black uppercase block mb-1">Alamat Domisili (Opsional)</label>
                <textarea
                  placeholder="e.g., Jl. Jendral Sudirman No. 45"
                  value={editCustomerAddress}
                  onChange={(e) => setEditCustomerAddress(e.target.value)}
                  className="w-full text-xs bg-zinc-900 border border-[#27272A] text-white p-2 outline-none focus:border-emerald-500 rounded-none font-sans h-16 resize-none"
                />
              </div>

              <div>
                <label className="text-[9.5px] text-zinc-350 font-black uppercase block mb-1">Parfum Terfavorit (Opsional)</label>
                <select
                  value={editCustomerParfum}
                  onChange={(e) => setEditCustomerParfum(e.target.value)}
                  className="w-full text-xs bg-zinc-900 border border-[#27272A] text-white p-2.5 outline-none focus:border-emerald-500 rounded-none cursor-pointer"
                >
                  <option value="">Pilih Parfum</option>
                  {(parfums && parfums.length > 0 ? parfums.map(p => p.nama) : [
                    "Lavender Sensation", 
                    "Sakura Blossom", 
                    "Lily Fresh", 
                    "Lemon Citrus", 
                    "Molto Gold", 
                    "Ocean Fresh", 
                    "Maura",
                    "Dianamist",
                    "Lovely",
                    "Polos (Tanpa Parfum)"
                  ]).map((nama) => (
                    <option key={nama} value={nama}>{nama}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-900 mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowEditCustomerModal(false);
                  setSelectedCustomerForEdit(null);
                }}
                className="flex-1 py-2 bg-zinc-950 border border-zinc-900 hover:bg-zinc-800 text-zinc-400 font-black text-[10px] uppercase tracking-wider transition rounded-none text-center"
              >
                Batal
              </button>
              
              <button
                type="button"
                onClick={async () => {
                  if (!editCustomerName.trim() || !editCustomerPhone.trim()) {
                    alert("Nama Pelanggan dan Nomor HP wajib diisi.");
                    return;
                  }
                  const updated: Customer = {
                    ...selectedCustomerForEdit,
                    nama: editCustomerName,
                    telepon: editCustomerPhone,
                    alamat: editCustomerAddress.trim(),
                    parfumFavorit: editCustomerParfum
                  };
                  await handleUpdateCustomer(updated);
                  setShowEditCustomerModal(false);
                  setSelectedCustomerForEdit(null);
                }}
                className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider transition rounded-none text-center flex items-center justify-center gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Reusable Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="absolute inset-0 bg-[#0A0A0B]/90 backdrop-blur-xs z-55 flex items-center justify-center p-6 animate-fade-in font-sans">
          <div className="w-full max-w-[320px] bg-[#121214] border border-[#27272A] p-5 shadow-2xl relative flex flex-col text-left">
            {/* Outline accent lines */}
            <div className={`absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 ${confirmModal.isDangerous ? "border-red-500" : "border-emerald-500"}`} />
            <div className={`absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 ${confirmModal.isDangerous ? "border-red-500" : "border-emerald-500"}`} />
            <div className={`absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 ${confirmModal.isDangerous ? "border-red-500" : "border-emerald-500"}`} />
            <div className={`absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 ${confirmModal.isDangerous ? "border-red-500" : "border-emerald-500"}`} />
            
            <h3 className={`text-xs font-black uppercase tracking-widest ${confirmModal.isDangerous ? "text-red-500" : "text-emerald-500"} mb-2`}>
              ⚠️ {confirmModal.title}
            </h3>
            
            <p className="text-[11px] text-zinc-350 font-semibold leading-relaxed mb-6">
              {confirmModal.message}
            </p>
            
            <div className="flex gap-2 mt-auto">
              <button
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="flex-1 py-2 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white border border-[#27272A] text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer rounded-none active:scale-95 text-center"
              >
                {confirmModal.cancelText || "BATAL"}
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`flex-1 py-2 text-black ${confirmModal.isDangerous ? "bg-red-500 hover:bg-red-400" : "bg-emerald-500 hover:bg-emerald-400"} text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer rounded-none active:scale-95 text-center`}
              >
                {confirmModal.confirmText || "YA, PROSES"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Pelanggan & Saldo Deposit */}
      {showCustomerProfileModal && selectedCustomerProfile && (() => {
        const c = selectedCustomerProfile;
        
        // Match past transactions
        const customerTransactions = transactions.filter(t => 
          (t.customerName === c.nama || t.customerPhone === c.telepon)
        );
        
        // Filter out unpaid/DP transactions for Piutang calculation
        const unpaidTransactions = customerTransactions.filter(t => 
          (t.statusBayar === "Belum Lunas" || t.statusBayar === "DP") && t.status !== "Batal"
        );
        
        // Calculate total Piutang
        const totalPiutang = unpaidTransactions.reduce((acc, t) => {
          if (t.statusBayar === "Belum Lunas") {
            return acc + t.totalHarga;
          } else {
            return acc + Math.max(0, t.totalHarga - (t.dpAmount || 0));
          }
        }, 0);
        
        const formatIDR = (num: number) => "Rp " + Math.round(num).toLocaleString("id-ID");
        
        return (
          <div className="absolute inset-0 bg-[#0A0A0B] z-50 flex flex-col font-sans text-left animate-fade-in">
            {/* Top Navigation Header */}
            <div className="p-4 bg-[#121214] border-b border-zinc-900 flex justify-between items-center shrink-0">
              <button 
                onClick={() => {
                  setShowCustomerProfileModal(false);
                  setSelectedCustomerProfile(null);
                }}
                className="p-1 px-2.5 bg-[#1C1C1E] border border-zinc-800 hover:border-emerald-500 text-zinc-400 hover:text-white text-[10px] font-black uppercase rounded-none duration-150"
              >
                &larr; KEMBALI
              </button>
              <div className="text-right">
                <span className="text-[8.5px] font-mono font-black text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 border border-emerald-950/20 uppercase tracking-widest">
                  ID: {c.id}
                </span>
              </div>
            </div>
            
            {/* Content Body Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Profile Card & Info */}
              <div className="bg-[#121214] border border-[#27272A] p-4 relative">
                {/* Corner Deco */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-emerald-500" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-emerald-500" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500" />
                
                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1.5 block">PROFIL PELANGGAN</p>
                <h3 className="text-white text-base font-black tracking-tight uppercase">{c.nama}</h3>
                
                <div className="mt-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-zinc-900 pb-1.5">
                    <span className="text-zinc-[450] font-bold">Nomor Telepon:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-white font-extrabold">{c.telepon}</span>
                      <a 
                        href={`https://api.whatsapp.com/send?phone=${c.telepon.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-1.5 py-0.5 bg-emerald-950 text-emerald-400 text-[8.5px] font-mono font-black uppercase rounded-none border border-emerald-900/40 hover:bg-emerald-900 duration-100 hover:text-white"
                      >
                        CHAT WA
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-zinc-900 pb-1.5">
                    <span className="text-zinc-[450] font-bold">Tanggal Gabung:</span>
                    <span className="text-white font-bold font-mono">
                      {c.createdAt 
                        ? new Date(c.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "4 Juni 2026"
                      }
                    </span>
                  </div>
                  <div className="flex items-start justify-between py-1 border-b border-zinc-900 pb-1.5">
                    <span className="text-zinc-[450] font-bold shrink-0">Alamat Rumah:</span>
                    <span className="text-white font-semibold text-right max-w-[200px] break-words">{c.alamat || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-zinc-[450] font-bold">Parfum Favorit:</span>
                    <span className="text-white font-bold">{c.parfumFavorit || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Wallet Card - Deposit Balance */}
              <div className="bg-[#121214] border border-[#27272A] p-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
                
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block mb-0.5">KARTU SALDO DEPOSIT</span>
                    <span className="text-[10.5px] text-zinc-400 font-medium">Deposit prabayar untuk melunasi nota transaksi</span>
                  </div>
                  <Coins className="w-4 h-4 text-emerald-400" />
                </div>
                
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-emerald-400 font-sans tracking-tight">
                    {formatIDR(c.saldoDeposit || 0)}
                  </span>
                </div>
                
                {/* Top Up Form */}
                <div className="mt-4 pt-4 border-t border-zinc-900/80">
                  <span className="text-[9.5px] text-zinc-350 font-black uppercase block mb-1.5 tracking-wider">Isi Ulang Saldo (Top-up)</span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Nominal rupiah, e.g., 50000"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      className="flex-1 text-xs bg-zinc-900 border border-zinc-800 text-white p-2 outline-none focus:border-emerald-500 rounded-none font-mono font-bold"
                    />
                    <button
                      onClick={async () => {
                        const amt = Math.round(parseFloat(topupAmount) || 0);
                        if (amt <= 0) {
                          alert("Silakan masukkan jumlah nominal top-up yang valid.");
                          return;
                        }
                        
                        const currentBal = c.saldoDeposit || 0;
                        const updated: Customer = {
                          ...c,
                          saldoDeposit: currentBal + amt
                        };
                        
                        await handleUpdateCustomer(updated);
                        setSelectedCustomerProfile(updated);
                        setTopupAmount("");
                        
                        alert(`Top-up saldo sukses!\n\nNama: ${c.nama}\nTop-up: ${formatIDR(amt)}\nSaldo Baru: ${formatIDR(currentBal + amt)}`);
                      }}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] uppercase font-black tracking-wider duration-150 rounded-none cursor-pointer"
                    >
                      TOP-UP
                    </button>
                  </div>
                  
                  {/* Quick Shortcut Buttons */}
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {[10000, 20000, 50000, 100000, 200000].map((shortAmt) => (
                      <button
                        key={shortAmt}
                        onClick={() => setTopupAmount(String(shortAmt))}
                        className="py-1 px-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 font-mono text-[9px] font-black text-zinc-400 hover:text-emerald-400 duration-100 rounded-none cursor-pointer"
                      >
                        +{shortAmt / 1000}K
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Piutang Outstanding List */}
              <div className="bg-[#121214] border border-[#27272A] relative flex flex-col">
                <div 
                  onClick={() => setProfileShowUnpaid(!profileShowUnpaid)}
                  className="p-4 flex justify-between items-center cursor-pointer hover:bg-zinc-900/50 transition duration-150 select-none"
                >
                  <div>
                    <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest block mb-0.5">RINGKASAN TOTAL PIUTANG</span>
                    <span className="text-[10px] text-zinc-500 font-medium">Click untuk {profileShowUnpaid ? "sembunyikan" : "lihat rincian nota & bayar"}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-none ${totalPiutang > 0 ? "bg-rose-950/20 text-rose-400 border border-rose-900/30" : "bg-emerald-950/20 text-emerald-400 border border-emerald-900/30"}`}>
                      {formatIDR(totalPiutang)}
                    </span>
                    <span className="text-zinc-500 font-bold text-xs">{profileShowUnpaid ? "▲" : "▼"}</span>
                  </div>
                </div>
                
                {profileShowUnpaid && (
                  <div className="p-4 pt-0 border-t border-zinc-900/40">
                    {unpaidTransactions.length === 0 ? (
                      <p className="py-5 text-center text-zinc-500 text-[10.5px] font-bold font-sans">
                        Sempurna! Pelanggan bebas dari piutang laundry.
                      </p>
                    ) : (
                      <div className="space-y-3 mt-3">
                        {/* WhatsApp Collection Template Trigger */}
                        <button
                          type="button"
                          onClick={() => {
                            setIsManuallyEdited(false);
                            setShowWaBillModal(true);
                          }}
                          className="w-full py-2.5 bg-[#0F5A2F] hover:bg-[#146F3C] border border-emerald-900/50 font-sans font-black text-[9.5px] text-white uppercase tracking-widest rounded-none transition-all flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer shadow-sm mb-1.5"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                          <span>Kirim Rincian Tagihan via WA (Templates)</span>
                        </button>

                        {unpaidTransactions.map(t => {
                          const sisa = t.statusBayar === "Belum Lunas" ? t.totalHarga : Math.max(0, t.totalHarga - (t.dpAmount || 0));
                          return (
                            <div key={t.id} className="bg-zinc-950/20 border border-zinc-900 p-3 flex flex-col justify-between gap-3 rounded-none">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="text-white font-mono font-black text-[11px] hover:text-emerald-400 cursor-pointer duration-100 flex items-center gap-1" onClick={() => setSelectedPastTrxInProfile(t)}>
                                    {t.id} &rarr; Detail &amp; Edit
                                  </p>
                                  <p className="text-zinc-350 text-[11px] mt-1 font-sans font-semibold leading-relaxed">{t.layananNama}</p>
                                  <p className="text-zinc-[450] text-[8.5px] font-mono mt-0.5">Masuk: {t.tanggalMasuk}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-rose-400 font-black font-mono text-xs">{formatIDR(sisa)}</p>
                                  <span className="text-[8px] px-1.5 py-0.2 bg-amber-950/40 text-amber-500 font-mono border border-amber-900/30 uppercase block mt-1 tracking-wider text-center">
                                    {t.statusBayar}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="pt-2.5 border-t border-zinc-900/60 flex justify-between gap-2">
                                <button
                                  onClick={() => setSelectedPastTrxInProfile(t)}
                                  className="px-2.5 py-1 bg-[#1C1C1E] hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500 text-zinc-400 hover:text-white text-[9.5px] font-black uppercase rounded-none duration-100 flex-1 text-center cursor-pointer"
                                >
                                  DETAIL NOTA
                                </button>
                                {(c.saldoDeposit !== undefined && c.saldoDeposit >= sisa) ? (
                                  <button
                                    onClick={async () => {
                                      const currentBal = c.saldoDeposit || 0;
                                      const newBal = currentBal - sisa;
                                      const updatedCust: Customer = {
                                        ...c,
                                        saldoDeposit: newBal
                                      };
                                      
                                      const updates: Partial<LaundryTransaction> = {
                                        statusBayar: "Lunas",
                                        pembayaranMetode: "Saldo Deposit",
                                        notes: t.notes 
                                          ? `${t.notes} [Lunas via Saldo Deposit]` 
                                          : "[Lunas via Saldo Deposit]"
                                      };
                                      
                                      await handleUpdateCustomer(updatedCust);
                                      setSelectedCustomerProfile(updatedCust);
                                      await handleUpdateTransaction(t.id, updates);
                                      
                                      alert(`Lunasi hutang sukses!\n\nNota: ${t.id}\nLunas: ${formatIDR(sisa)}\nSisa Deposit: ${formatIDR(newBal)}`);
                                    }}
                                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-black text-[9.5px] font-black uppercase rounded-none duration-100 flex-1 text-center cursor-pointer"
                                  >
                                    BAYAR VIA SALDO
                                  </button>
                                ) : (
                                  <button
                                    disabled
                                    className="px-2.5 py-1 bg-zinc-950 border border-zinc-900/40 text-zinc-650 text-[9px] font-black uppercase rounded-none flex-1 text-center cursor-not-allowed"
                                    title="Saldo deposit tidak cukup"
                                  >
                                    SALDO KURANG
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Past Transactions History List */}
              <div className="bg-[#121214] border border-[#27272A] relative flex flex-col">
                <div 
                  onClick={() => setProfileShowAll(!profileShowAll)}
                  className="p-4 flex justify-between items-center cursor-pointer hover:bg-zinc-900/50 transition duration-150 select-none pb-4"
                >
                  <div>
                    <span className="text-[9px] font-black text-sky-450 uppercase tracking-widest block mb-0.5">DAFTAR SEMUA TRANSAKSI</span>
                    <span className="text-[10px] text-zinc-500 font-medium">Buka untuk melihat riwayat nota ({customerTransactions.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8.5px] font-black font-mono text-sky-450 bg-sky-950/20 px-1.5 py-0.5 border border-sky-900/40 uppercase tracking-wider">
                      {customerTransactions.length} Nota
                    </span>
                    <span className="text-zinc-500 font-bold text-xs">{profileShowAll ? "▲" : "▼"}</span>
                  </div>
                </div>
                
                {profileShowAll && (
                  <div className="p-4 pt-0 border-t border-zinc-900/40">
                    <p className="text-[9.5px] text-zinc-500 font-semibold mb-2.5">💡 Tips: Klik nota/ID transaksi untuk membuka menu edit lengkap pembayarannya.</p>
                    {customerTransactions.length === 0 ? (
                      <p className="py-6 border border-dashed border-zinc-850 text-center text-zinc-500 text-[10.5px] font-medium font-sans">
                        Belum ada riwayat transaksi nota.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {customerTransactions.map(t => {
                          return (
                            <div 
                              key={t.id} 
                              onClick={() => setSelectedPastTrxInProfile(t)}
                              className="bg-zinc-950/20 border border-zinc-900 p-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer hover:border-[#2563EB]/60 duration-100"
                            >
                              <div className="flex-1 pr-1">
                                <p className="text-white font-mono font-bold text-[11px] flex items-center gap-2">
                                  {t.id}
                                  <span className={`text-[7.5px] font-black font-sans uppercase tracking-widest px-1 py-0.2 rounded-xs border ${
                                    t.status === "Antrian" || t.status === "Proses"
                                      ? "bg-amber-950/10 text-amber-500 border-amber-900/30"
                                      : t.status === "Selesai" || t.status === "Diambil"
                                      ? "bg-emerald-950/10 text-emerald-400 border-emerald-900/30"
                                      : "bg-red-950/10 text-rose-500 border-red-900/30"
                                  }`}>
                                    {t.status}
                                  </span>
                                </p>
                                <p className="text-zinc-[350] mt-1 font-semibold leading-snug">{t.layananNama}</p>
                                <p className="text-zinc-500 text-[8.5px] font-mono mt-0.5">Tgl: {t.tanggalMasuk}</p>
                              </div>
                              
                              <div className="text-right shrink-0">
                                <p className="text-sky-400 font-extrabold font-mono text-xs">{formatIDR(t.totalHarga)}</p>
                                <span className={`text-[8px] font-black mt-0.5 uppercase tracking-wide inline-block font-mono ${
                                  t.statusBayar === "Lunas" ? "text-emerald-400" : "text-rose-400"
                                }`}>
                                  {t.statusBayar}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Sub-Modal Overlay to View Transaction/Nota Invoice Detail inside Profile Drawer */}
            {selectedPastTrxInProfile && (() => {
              const pt = selectedPastTrxInProfile;
              return (
                <div className="absolute inset-0 bg-black/90 z-60 flex flex-col font-sans text-left animate-fade-in p-4 overflow-y-auto">
                  <div className="bg-[#121214] border border-[#27272A] p-5 w-full max-w-[340px] mx-auto my-auto relative shadow-2xl flex flex-col text-left">
                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-sky-500" />
                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-sky-500" />
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-sky-500" />
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-sky-500" />

                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-900">
                      <div>
                        <span className="text-[8px] font-black uppercase text-sky-400 tracking-wider block">INVOICE DETAIL / NOTA</span>
                        <h4 className="text-white font-extrabold text-[12.5px] uppercase font-mono">{pt.id}</h4>
                      </div>
                      <button 
                        onClick={() => setSelectedPastTrxInProfile(null)}
                        className="py-1 px-2 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-sky-500 font-black text-[9px] uppercase tracking-wider duration-100 rounded-none cursor-pointer"
                      >
                        CLOSE
                      </button>
                    </div>

                    <div className="space-y-2.5 text-xs text-zinc-300">
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                        <span className="text-zinc-[450] font-bold">Layanan</span>
                        <span className="text-white font-bold max-w-[180px] text-right">{pt.layananNama}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                        <span className="text-zinc-[450] font-bold">Parfum</span>
                        <span className="text-zinc-200 font-bold">{pt.parfum}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                        <span className="text-zinc-[450] font-bold">Berat / Takaran</span>
                        <span className="text-white font-mono font-bold">{pt.berat} Unit</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                        <span className="text-zinc-[450] font-bold">Tanggal Masuk</span>
                        <span className="text-zinc-200 font-mono font-bold">{pt.tanggalMasuk}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                        <span className="text-zinc-[450] font-bold">Status</span>
                        <span className="text-white font-black uppercase">{pt.status}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                        <span className="text-zinc-[450] font-bold">Status Bayar</span>
                        <span className="text-white font-extrabold uppercase">{pt.statusBayar} ({pt.pembayaranMetode})</span>
                      </div>
                      {pt.statusBayar === "DP" && pt.dpAmount && (
                        <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                          <span className="text-zinc-[450] font-bold">DP Terbayar</span>
                          <span className="text-amber-500 font-mono font-bold">{formatIDR(pt.dpAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                        <span className="text-zinc-[450] font-bold">Catatan</span>
                        <span className="text-zinc-400 italic max-w-[200px] text-right break-words">{pt.notes || "-"}</span>
                      </div>
                      
                      <div className="bg-sky-950/15 border border-sky-900/10 p-3 mt-3 flex flex-col justify-center items-center">
                        <span className="text-zinc-500 text-[9px] uppercase tracking-wider block mb-0.5">Total Harga</span>
                        <span className="text-xl font-black text-sky-400 font-sans tracking-wide">
                          {formatIDR(pt.totalHarga)}
                        </span>
                      </div>
                      
                      <button 
                        onClick={() => {
                          setTrxSelectedDetailTrxId(pt.id);
                          setShowCustomerProfileModal(false);
                          setSelectedCustomerProfile(null);
                          setSelectedPastTrxInProfile(null);
                          setActiveTab("transaksi");
                        }}
                        className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10.5px] uppercase tracking-wider transition rounded-none text-center flex items-center justify-center gap-1.5 mt-4 cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" /> Buka Menu Edit &amp; Pembayaran Lengkap
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Global System Update Popup */}
      <SystemUpdatePopup ownerId={currentOwnerId || user?.uid} />

    </MobileFrame>
  );
}
