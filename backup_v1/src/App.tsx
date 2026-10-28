import React, { useState, useEffect } from "react";
import { MobileFrame } from "./components/MobileFrame";
import { DashboardHome } from "./components/DashboardHome";
import { ExpenseForm } from "./components/ExpenseForm";
import { ExpenseHistory } from "./components/ExpenseHistory";
import { AiAssistant } from "./components/AiAssistant";
import { Expense, CategorySpec, Karyawan } from "./types";
import { INITIAL_BUDGET_LIMIT, PREDEFINED_CATEGORIES, SAMPLE_EXPENSES } from "./data";
import { 
  LayoutDashboard, 
  PlusCircle, 
  History, 
  Bot, 
  Smartphone, 
  Copy, 
  Check, 
  Database, 
  LogOut,
  Users
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

export default function App() {
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
  const currentOwnerId = user ? user.uid : (loggedInAdmin ? loggedInAdmin.ownerId : null);
  
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Global States (Defaulting to basic or empty lists, populated by sync/localStorage)
  const [expenses, setExpenses] = useState<Expense[]>([]);

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

  const [portalTab, setPortalTab] = useState<"owner" | "admin" | "karyawan">("owner");
  const [loginId, setLoginId] = useState<string>("");
  const [loginUser, setLoginUser] = useState<string>("");
  const [loginPass, setLoginPass] = useState<string>("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [isGuestSession, setIsGuestSession] = useState<boolean>(() => {
    return localStorage.getItem("damdam_is_guest") === "true";
  });

  const [showMobileModal, setShowMobileModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const sharedUrl = "https://ais-pre-wotufd5mmddfkfc5g2nq3e-698394579071.asia-southeast1.run.app";

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
          list.push(d.data() as Expense);
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
      if (!user && !loggedInAdmin) {
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
  }, [expenses, currentOwnerId, user, loggedInAdmin]);

  // Sync back to local offline storage ONLY when user is offline (Guest mode)
  useEffect(() => {
    if (!user && !loggedInAdmin) {
      localStorage.setItem("laundrosave_expenses_clean_v2", JSON.stringify(expenses));
    }
  }, [expenses, user, loggedInAdmin]);

  useEffect(() => {
    if (!user && !loggedInAdmin) {
      localStorage.setItem("laundrosave_categories_clean_v2", JSON.stringify(categories));
    }
  }, [categories, user, loggedInAdmin]);

  useEffect(() => {
    if (!user && !loggedInAdmin) {
      localStorage.setItem("laundrosave_budget_limit", String(budgetLimit));
    }
  }, [budgetLimit, user, loggedInAdmin]);

  // Login handler
  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      localStorage.removeItem("damdam_is_guest");
      setIsGuestSession(false);
    } catch (err) {
      console.error("Popup authentication failed:", err);
      alert("Sign-in gagal: " + (err instanceof Error ? err.message : String(err)));
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

  // Sign out helper
  const handleSignOut = () => {
    triggerConfirm(
      "KELUAR SINKRONISASI CLOUD",
      "Apakah Anda yakin ingin keluar dari sinkronisasi database cloud? Anda akan dapat memilih atau berganti Akun Google lain saat masuk kembali.",
      async () => {
        try {
          await signOut(auth);
          setExpenses([]);
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
      } catch (err) {
        console.error("Firestore create error:", err);
        alert("Gagal menambahkan transaksi ke cloud: " + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      setExpenses((prev) => [fresh, ...prev]);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/expenses/${id}`;
      try {
        await deleteDoc(doc(db, "users", currentOwnerId, "expenses", id));
      } catch (err) {
        console.error("Firestore delete error:", err);
        alert("Gagal menghapus transaksi dari cloud: " + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      setExpenses((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleUpdateExpense = async (updated: Expense) => {
    if (currentOwnerId) {
      const path = `users/${currentOwnerId}/expenses/${updated.id}`;
      try {
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
      setExpenses((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
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
  if (!user && !loggedInAdmin && !loggedInKaryawan && !isGuestSession) {
    return (
      <MobileFrame>
        <div className="flex-1 flex flex-col bg-[#0A0A0B] text-white p-5 justify-between font-sans min-h-0 overflow-y-auto">
          {/* Brand Logo Header */}
          <div className="text-center py-4 select-none shrink-0 border-b border-[#1E1E21] pb-5">
            <div className="w-12 h-12 rounded-sm bg-emerald-500 mx-auto flex items-center justify-center mb-3">
              <span className="text-black text-lg font-black font-mono">D</span>
            </div>
            <h1 className="text-xl font-black tracking-tighter text-emerald-500">
              DAMDAM <span className="text-white italic text-base">LAUNDRY</span>
            </h1>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mt-1.5">
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
                <p className="text-zinc-400 font-semibold leading-relaxed max-w-[280px] mx-auto">
                  Kelola pencatatan pengeluaran, kategori, limit bulanan, serta pantau presensi & gaji kerja karyawan.
                </p>
                <button
                  onClick={handleSignIn}
                  className="w-full py-3 bg-[#10b981] hover:bg-[#059669] text-black font-black text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  Masuk dengan Akun Google
                </button>
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
          <div className="text-center py-3 select-none shrink-0 border-t border-[#1E1E21] pt-4">
            <button
              onClick={() => {
                localStorage.setItem("damdam_is_guest", "true");
                setIsGuestSession(true);
              }}
              className="text-[10px] font-black text-amber-500 hover:text-amber-400 underline uppercase tracking-widest cursor-pointer"
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
      <header className="w-full bg-[#0A0A0B] text-white border-b border-[#27272A] px-5 py-4 select-none shrink-0 relative flex items-center justify-between z-40">
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-sm bg-emerald-500 flex items-center justify-center font-bold">
            <span className="text-black text-xs font-black">D</span>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter text-emerald-500">
              DAMDAM <span className="text-white italic text-sm">LAUNDRY</span>
            </h1>
            <p className="text-[8.5px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-0.5">
              Financial Engine
            </p>
          </div>
        </div>

        {/* User context info & Cloud auth indicator */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowMobileModal(true)}
            className="flex items-center gap-1 px-2 py-1 bg-[#121214] border border-[#27272A] hover:border-emerald-500 text-emerald-450 text-[9.5px] font-black uppercase tracking-wider rounded-none cursor-pointer duration-150 transition-all active:scale-95"
            title="Scan QR Code untuk dicoba di HP"
          >
            <Smartphone className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="hidden md:inline leading-none">Coba di HP</span>
            <span className="md:hidden">HP</span>
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
      {!authLoading && !user && !loggedInAdmin && (
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
          <DashboardHome
            expenses={expenses}
            budgetLimit={budgetLimit}
            categories={categories}
            onSetViewTab={setActiveTab}
            onSetBudgetLimit={handleSetBudgetLimit}
            onResetToEmpty={handleResetToEmpty}
            onLoadSampleData={handleLoadSampleData}
          />
        )}
        
        {activeTab === "catat" && (
          <ExpenseForm
            onAddExpense={handleAddExpense}
            onSetViewTab={setActiveTab}
            categories={categories}
            onAddCategory={handleAddCategory}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
            onResetCategoriesToDefault={handleResetCategoriesToDefault}
            onUpdateSubCategories={handleUpdateSubCategories}
            triggerConfirm={triggerConfirm}
          />
        )}

        {activeTab === "history" && (
          <ExpenseHistory
            expenses={expenses}
            categories={categories}
            onDeleteExpense={handleDeleteExpense}
            onUpdateExpense={handleUpdateExpense}
            triggerConfirm={triggerConfirm}
          />
        )}

        {activeTab === "advisor" && (
          <AiAssistant
            expenses={expenses}
            budgetLimit={budgetLimit}
          />
        )}

        {activeTab === "karyawan" && !loggedInAdmin && (
          user ? (
            <OwnerKaryawanPanel
              ownerId={user.uid}
              onAddExpense={handleAddExpense}
              triggerConfirm={triggerConfirm}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#0A0A0B] text-zinc-550 text-center font-sans p-6 space-y-4">
              <div className="w-12 h-12 bg-amber-955/15 border border-amber-900/30 flex items-center justify-center rounded-none">
                <Database className="w-6 h-6 text-amber-500" />
              </div>
              <h2 className="text-sm font-black text-white uppercase tracking-tight">KONTROL STAF TERKUNCI</h2>
              <p className="text-[11px] text-zinc-400 leading-relaxed max-w-[270px]">
                Fitur CRUD Karyawan, GPS Geofencing, Log Absen, dan Payout Gaji Sinkronis hanya tersedia dalam mode tersinkron database cloud.
              </p>
              <button
                onClick={handleSignIn}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10.5px] uppercase tracking-widest rounded-none transition-all cursor-pointer"
              >
                HUBUNGKAN DATABASE GOOGLE
              </button>
            </div>
          )
        )}
      </main>


      {/* 3. Simulated OS App Bottom Navigation Tab Bar */}
      <nav className="w-full h-16 bg-[#121214] border-t border-[#27272A] flex items-center justify-around select-none shrink-0 z-40 px-2 pb-1">
        {/* Tab 1: Overview */}
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-all cursor-pointer relative ${
            activeTab === "dashboard"
              ? "text-emerald-400 font-black bg-zinc-900/50"
              : "text-zinc-500 hover:text-zinc-300 font-bold"
          }`}
        >
          {activeTab === "dashboard" && (
            <div className="absolute top-0 w-6 h-0.5 bg-emerald-500 rounded-full" />
          )}
          <LayoutDashboard className={`w-5 h-5 ${activeTab === "dashboard" ? "stroke-[2.5px] text-emerald-400" : "stroke-2"}`} />
          <span className="text-[9px] mt-0.5 tracking-wider uppercase font-black">Overview</span>
        </button>

        {/* Tab 2: Catat */}
        <button
          onClick={() => setActiveTab("catat")}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-all cursor-pointer relative ${
            activeTab === "catat"
              ? "text-emerald-400 font-black bg-zinc-900/50"
              : "text-zinc-500 hover:text-zinc-300 font-bold"
          }`}
        >
          {activeTab === "catat" && (
            <div className="absolute top-0 w-6 h-0.5 bg-emerald-500 rounded-full" />
          )}
          <PlusCircle className={`w-5 h-5 ${activeTab === "catat" ? "stroke-[2.5px] text-emerald-400" : "stroke-2"}`} />
          <span className="text-[9px] mt-0.5 tracking-wider uppercase font-black">Catat</span>
        </button>

        {/* Tab 3: Riwayat */}
        <button
          onClick={() => setActiveTab("history")}
          className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-all cursor-pointer relative ${
            activeTab === "history"
              ? "text-emerald-400 font-black bg-zinc-900/50"
              : "text-zinc-500 hover:text-zinc-300 font-bold"
          }`}
        >
          {activeTab === "history" && (
            <div className="absolute top-0 w-6 h-0.5 bg-emerald-500 rounded-full" />
          )}
          <History className={`w-5 h-5 ${activeTab === "history" ? "stroke-[2.5px] text-emerald-400" : "stroke-2"}`} />
          <span className="text-[9px] mt-0.5 tracking-wider uppercase font-black">Riwayat</span>
        </button>

        {/* Tab 3.5: Staf */}
        {!loggedInAdmin && (
          <button
            onClick={() => setActiveTab("karyawan")}
            className={`flex flex-col items-center justify-center w-14 h-12 rounded-lg transition-all cursor-pointer relative ${
              activeTab === "karyawan"
                ? "text-emerald-400 font-black bg-zinc-900/50"
                : "text-zinc-500 hover:text-zinc-300 font-bold"
            }`}
          >
            {activeTab === "karyawan" && (
              <div className="absolute top-0 w-6 h-0.5 bg-emerald-500 rounded-full" />
            )}
            <Users className={`w-5 h-5 ${activeTab === "karyawan" ? "stroke-[2.5px] text-emerald-400" : "stroke-2"}`} />
            <span className="text-[9px] mt-0.5 tracking-wider uppercase font-black">Staf</span>
          </button>
        )}

        {/* Tab 4: AI Advisor */}
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
            <Bot className={`w-5 h-5 ${activeTab === "advisor" ? "stroke-[2.5px] text-emerald-400" : "stroke-2"}`} />
            {activeTab !== "advisor" && (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse border border-zinc-900" />
            )}
          </div>
          <span className="text-[9px] mt-0.5 tracking-wider uppercase font-black">Sari AI</span>
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

          {/* Bottom Close Button */}
          <button
            onClick={() => setShowMobileModal(false)}
            className="w-full mt-3 py-3 bg-emerald-500 hover:bg-emerald-450 text-black text-xs font-black tracking-widest uppercase rounded-none transition-all cursor-pointer shadow-md text-center active:scale-98 shrink-0"
          >
            KEMBALI KE APLIKASI
          </button>
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
    </MobileFrame>
  );
}
