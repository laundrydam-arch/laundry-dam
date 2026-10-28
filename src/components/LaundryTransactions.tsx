import React, { useState, useEffect, useMemo } from "react";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "../firebase";
import { LocationConfig } from "../types";
import { 
  Plus, 
  Search, 
  Printer, 
  Share2, 
  Trash2, 
  Check, 
  FileText, 
  DollarSign, 
  User, 
  Phone, 
  Weight, 
  Calendar, 
  Clock, 
  Eye, 
  ChevronRight,
  Sparkles,
  Smartphone,
  CheckCircle,
  X,
  CreditCard,
  UserPlus,
  Pencil,
  Copy,
  MoreHorizontal,
  Shirt,
  ArrowLeft
} from "lucide-react";
import { LaundryTransaction, Customer, Service, Parfum } from "../types";
import {
  isBluetoothSupported,
  isPrinterConnected,
  getConnectedDeviceName,
  connectPrinter,
  disconnectPrinter,
  generateReceiptEscPos,
  generateLabelEscPos,
  sendToPrinter,
  triggerWebPrint
} from "../utils/bluetoothPrinter";

interface LaundryTransactionsProps {
  transactions: LaundryTransaction[];
  customers: Customer[];
  services: Service[];
  parfums?: Parfum[];
  activeOwnerId: string | null;
  activeCashierName?: string;
  isOwner?: boolean;
  onAddTransaction: (trx: LaundryTransaction) => Promise<void>;
  onUpdateTransaction: (id: string, updates: Partial<LaundryTransaction>) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onAddCustomer: (cust: Customer) => Promise<void>;
  onAddService: (item: Service) => Promise<void>;
  onUpdateCustomer?: (cust: Customer) => Promise<void>;
  onAddParfum?: (nama: string) => Promise<void>;
  showCreateModalDirectly?: boolean;
  onCloseCreateModalDirectly?: () => void;
  showCustomerModalDirectly?: boolean;
  onCloseCustomerModalDirectly?: () => void;
  showServiceModalDirectly?: boolean;
  onCloseServiceModalDirectly?: () => void;
  triggerConfirm: (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    isDangerous?: boolean
  ) => void;
  initialDateFilter?: string;
  initialSelectedTrxId?: string | null;
  initialSpecialFilter?: "dueToday" | "overdue" | "lunasBulanIni" | "dpBulanIni" | "paketBulanIni" | "semuaHutang" | "dpHutang" | "belumLunasHutang" | "";
  onClearInitialFilters?: () => void;
  onViewCustomerProfile?: (cust: Customer) => void;
}

export function LaundryTransactions({
  transactions,
  customers,
  services,
  parfums = [],
  activeOwnerId,
  activeCashierName = "Mba Dwi",
  isOwner = false,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onAddCustomer,
  onAddService,
  onUpdateCustomer,
  onAddParfum,
  showCreateModalDirectly = false,
  onCloseCreateModalDirectly,
  showCustomerModalDirectly = false,
  onCloseCustomerModalDirectly,
  showServiceModalDirectly = false,
  onCloseServiceModalDirectly,
  triggerConfirm,
  initialDateFilter,
  initialSelectedTrxId,
  initialSpecialFilter,
  onClearInitialFilters,
  onViewCustomerProfile
}: LaundryTransactionsProps) {
  const defaultParfumNames = ["Lavender Sensation", "Sakura Blossom", "Lily Fresh", "Lemon Citrus", "Molto Gold", "Ocean Fresh", "Maura", "Dianamist", "Lovely", "Polos (Tanpa Parfum)"];
  
  // Maintain a local list of instantly-added perfumes for flawless immediate display
  const [localAddedParfums, setLocalAddedParfums] = useState<Parfum[]>([]);

  const getPerfumeOptions = (currentVal?: string) => {
    const combinedParfums = [...(parfums || []), ...localAddedParfums];
    const customNames = combinedParfums.map(p => p.nama);
    // Use synchronized database perfumes. If database has loaded elements, use those. Else, fallback while loading.
    const baseNames = customNames.length > 0 ? customNames : defaultParfumNames;
    const combined = Array.from(new Set(baseNames));
    if (currentVal && !combined.includes(currentVal)) {
      combined.push(currentVal);
    }
    return combined;
  };
  const getServiceUnitText = (nama?: string, tipe?: string): string => {
    const nameLower = (nama || "").toLowerCase();
    const matchedService = services.find(s => s.nama.toLowerCase() === nameLower);
    const actualTipe = matchedService ? matchedService.tipe : tipe;
    const tipeLower = (actualTipe || "").toLowerCase();

    if (tipeLower === "meter" || tipeLower === "meteran" || tipeLower === "m" || tipeLower === "m2") {
      return "m";
    }
    if (tipeLower === "set") {
      return "Set";
    }
    if (tipeLower === "satuan" || tipeLower === "pcs" || tipeLower === "pc") {
      return "Pcs";
    }
    if (tipeLower === "pasang") {
      return "Pasang";
    }
    if (tipeLower === "lusin") {
      return "Lusin";
    }
    if (tipeLower === "kiloan" || tipeLower === "kg") {
      return "Kg";
    }

    if (nameLower.includes("karpet")) {
      return "m";
    }
    return "Kg";
  };

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("Semua");
  const [dateFilter, setDateFilter] = useState<string>(initialDateFilter || "");
  const [specialFilter, setSpecialFilter] = useState<"dueToday" | "overdue" | "lunasBulanIni" | "dpBulanIni" | "paketBulanIni" | "semuaHutang" | "dpHutang" | "belumLunasHutang" | "">(initialSpecialFilter || "");

  // Detail and Edit States to match Screenshot 2 and 3
  const [selectedDetailTrx, setSelectedDetailTrx] = useState<LaundryTransaction | null>(null);

  React.useEffect(() => {
    if (initialDateFilter !== undefined) {
      setDateFilter(initialDateFilter);
    }
  }, [initialDateFilter]);

  React.useEffect(() => {
    if (initialSpecialFilter !== undefined) {
      setSpecialFilter(initialSpecialFilter);
    }
  }, [initialSpecialFilter]);

  React.useEffect(() => {
    if (initialSelectedTrxId) {
      const found = transactions.find((t) => t.id === initialSelectedTrxId);
      if (found) {
        setSelectedDetailTrx(found);
      }
    } else if (initialSelectedTrxId === null) {
      setSelectedDetailTrx(null);
    }
  }, [initialSelectedTrxId, transactions]);

  const [showDetailActionsSheet, setShowDetailActionsSheet] = useState<boolean>(false);
  const [isEditingTrx, setIsEditingTrx] = useState<boolean>(false);

  // States for inline quantity edit
  const [editingServiceIdInline, setEditingServiceIdInline] = useState<string | null>(null);
  const [inlineEditWeightValue, setInlineEditWeightValue] = useState<string>("");
  const [inlineEditServiceId, setInlineEditServiceId] = useState<string>("");

  // States for Pembayaran half-sheet modal
  const [showPaymentSheet, setShowPaymentSheet] = useState<boolean>(false);
  const [paymentStatus, setPaymentStatus] = useState<"DP" | "Lunas">("Lunas");
  const [paymentDpAmountValue, setPaymentDpAmountValue] = useState<string>("");
  const [paymentMethodValue, setPaymentMethodValue] = useState<"Tunai" | "QRIS" | "Transfer" | "Saldo Deposit">("Tunai");
  const [paymentBukuKas, setPaymentBukuKas] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  // Editing form states in the full editing sheet
  const [editCustName, setEditCustName] = useState<string>("");
  const [editCustPhone, setEditCustPhone] = useState<string>("");
  const [editSelectedLayanan, setEditSelectedLayanan] = useState<Array<{
    id: string;
    serviceId: string;
    nama: string;
    berat: number | string;
    harga: number;
    tipe: string;
  }>>([]);
  const [editBiayaTambahan, setEditBiayaTambahan] = useState<Array<{
    id: string;
    nama: string;
    jumlah: number;
  }>>([]);
  const [editParfum, setEditParfum] = useState<string>("Lavender Sensation");
  const [editStatusBayar, setEditStatusBayar] = useState<"Lunas" | "Belum Lunas">("Belum Lunas");
  const [editPaymentMethod, setEditPaymentMethod] = useState<"Tunai" | "QRIS" | "Transfer" | "Saldo Deposit">("Tunai");
  const [editStatus, setEditStatus] = useState<string>("Antrian");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editWaktuMasuk, setEditWaktuMasuk] = useState<string>("");
  const [editWaktuSelesai, setEditWaktuSelesai] = useState<string>("");
  const [editDiskonNominal, setEditDiskonNominal] = useState<number>(0);
  const [editShowDiskonInput, setEditShowDiskonInput] = useState<boolean>(false);
  const [editIsPembulatanActive, setEditIsPembulatanActive] = useState<boolean>(true);
  const [editPembulatanTipe, setEditPembulatanTipe] = useState<"500" | "1000">("1000");
  const [editCashier, setEditCashier] = useState<string>("Mba Dwi");

  // Bottom sheets in editing flow
  const [isEditSelectingServSheet, setIsEditSelectingServSheet] = useState<boolean>(false);
  const [editServSearchQuery, setEditServSearchQuery] = useState<string>("");

  // Flow dialogues:
  const [isCreatingTrx, setIsCreatingTrx] = useState<boolean>(showCreateModalDirectly);
  const [isCreatingCust, setIsCreatingCust] = useState<boolean>(showCustomerModalDirectly);
  const [isCreatingServ, setIsCreatingServ] = useState<boolean>(showServiceModalDirectly);

  // active invoice printing simulation & Bluetooth POS Print states:
  const [printingTrx, setPrintingTrx] = useState<LaundryTransaction | null>(null);
  const [printingProgress, setPrintingProgress] = useState<number>(0);
  const [isPrintFinished, setIsPrintFinished] = useState<boolean>(false);
  const [printType, setPrintType] = useState<"nota" | "label">("nota");
  const [bluetoothPromptTrx, setBluetoothPromptTrx] = useState<{
    trx: LaundryTransaction;
    type: "nota" | "label";
  } | null>(null);

  const [printerState, setPrinterState] = useState<{
    connected: boolean;
    name: string | null;
    supported: boolean;
  }>({
    connected: isPrinterConnected(),
    name: getConnectedDeviceName(),
    supported: isBluetoothSupported(),
  });

  const [btsPrinting, setBtsPrinting] = useState<boolean>(false);

  useEffect(() => {
    const handleSync = () => {
      const isConn = isPrinterConnected();
      const devName = getConnectedDeviceName();
      setPrinterState(prev => {
        if (prev.connected !== isConn || prev.name !== devName) {
          return {
            ...prev,
            connected: isConn,
            name: devName
          };
        }
        return prev;
      });
    };
    handleSync();
    const interval = setInterval(handleSync, 1000);
    return () => clearInterval(interval);
  }, []);

  const [outletConfig, setOutletConfig] = useState<LocationConfig>({
    latitude: -6.2088,
    longitude: 106.8456,
    radius: 100,
    namaLokasi: "Damdam Laundry",
    alamatLokasi: "Jagakarsa, Kota Jakarta Selatan",
    teleponLokasi: "085743031695",
    jamBukaLokasi: "07.30 - 21.00",
    ketentuanNota: "1. Pembayaran Qris wajib kirim bukti\n2. Pengaduan Komplain max 1x24 jam\n3. Kerusakan luntur, susut dan berkerut akibat proses pencucian bukan tanggung jawab kami.\n4. Jumlah pakaian yang tidak dihitung oleh pelanggan bukan tanggung jawab kami dan hitungan kami yang dianggap benar."
  });

  useEffect(() => {
    if (!activeOwnerId || activeOwnerId === "guest") return;
    const locRef = doc(db, "users", activeOwnerId, "settings", "location");
    const unsub = onSnapshot(locRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as LocationConfig;
        setOutletConfig({
          latitude: data.latitude,
          longitude: data.longitude,
          radius: data.radius,
          namaLokasi: data.namaLokasi || "Damdam Laundry",
          alamatLokasi: data.alamatLokasi || "Jagakarsa, Kota Jakarta Selatan",
          teleponLokasi: data.teleponLokasi || "085743031695",
          jamBukaLokasi: data.jamBukaLokasi || "07.30 - 21.00",
          ketentuanNota: data.ketentuanNota || "1. Pembayaran Qris wajib kirim bukti\n2. Pengaduan Komplain max 1x24 jam\n3. Kerusakan luntur, susut dan berkerut akibat proses pencucian bukan tanggung jawab kami.\n4. Jumlah pakaian yang tidak dihitung oleh pelanggan bukan tanggung jawab kami dan hitungan kami yang dianggap benar."
        });
      }
    });
    return unsub;
  }, [activeOwnerId]);

  const generateWhatsAppReceiptText = (trx: LaundryTransaction): string => {
    const shopName = outletConfig.namaLokasi || "Damdam Laundry";
    const shopAddress = outletConfig.alamatLokasi || "Jagakarsa, Kota Jakarta Selatan";
    const shopPhone = outletConfig.teleponLokasi || "085743031695";
    const shopHours = outletConfig.jamBukaLokasi || "07.30 - 21.00";

    const formatIdIndo = (rawId: string) => {
      return rawId.replace(/-/g, "/");
    };

    const formatTanggalWhatsApp = (dateStr?: string): string => {
      if (!dateStr) return "";
      try {
        const d = new Date(dateStr.replace(" ", "T"));
        if (isNaN(d.getTime())) return dateStr;
        
        const bulanIndo = [
          "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
          "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
        ];
        const day = d.getDate().toString().padStart(2, '0');
        const month = bulanIndo[d.getMonth()];
        const year = d.getFullYear();
        const hours = d.getHours().toString().padStart(2, '0');
        const mins = d.getMinutes().toString().padStart(2, '0');
        
        return `${day} ${month} ${year}, ${hours}:${mins}`;
      } catch (_) {
        return dateStr || "";
      }
    };

    const rawNotes = trx.notes || "";
    // Extract cashier info
    const cashierMatch = rawNotes.match(/\[Kasir:\s*([^\]]+)\]/);
    const cashierName = cashierMatch ? cashierMatch[1] : activeCashierName;

    // Extract discount
    let diskonNominalExt = 0;
    const diskMatch = rawNotes.match(/\(Diskon:\s*Rp\s*([\d,.]+)\)/);
    if (diskMatch) {
      diskonNominalExt = parseInt(diskMatch[1].replace(/[,.]/g, ""), 10) || 0;
    }

    // Extract pembulatan (rounding value)
    let pembulatanNominalExt = 0;
    const pembMatch = rawNotes.match(/\(Pembulatan:\s*Rp\s*([\d,.]+)\)/);
    if (pembMatch) {
      pembulatanNominalExt = parseInt(pembMatch[1].replace(/[,.]/g, ""), 10) || 0;
    }

    // Extract extra fees
    let extraFeesSum = 0;
    const btMatch = rawNotes.match(/\(Biaya Tambahan:\s*([^)]+)\)/);
    if (btMatch) {
      const parts = btMatch[1].split(", ");
      parts.forEach(p => {
        const itemParts = p.split(": Rp ");
        if (itemParts.length >= 2) {
          extraFeesSum += parseInt(itemParts[1].replace(/[,.]/g, ""), 10) || 0;
        }
      });
    }

    // Format list of services
    const listLayanan = parseLayananString(trx.layananNama, trx.layananId, trx.berat, trx.totalHarga);
    let layananFormatted = "";
    if (listLayanan && listLayanan.length > 0) {
      listLayanan.forEach((item, index) => {
        const unit = getServiceUnitText(item.nama, item.tipe);
        const beratNum = typeof item.berat === "number" ? item.berat : parseFloat(item.berat) || 0;
        const itemTotal = beratNum * item.harga;
        
        layananFormatted += `${item.nama}\n` +
                            `${beratNum} ${unit.toLowerCase()} x Rp${item.harga.toLocaleString("id-ID")} = Rp${itemTotal.toLocaleString("id-ID")}`;
        if (index < listLayanan.length - 1) {
          layananFormatted += "\n";
        }
      });
    } else {
      const fallbackUnit = trx.layananNama.toLowerCase().includes("kiloan") ? "kg" : "pc";
      const fallbackPrice = Math.round(trx.totalHarga / (trx.berat || 1));
      layananFormatted = `${trx.layananNama}\n` +
                         `${trx.berat} ${fallbackUnit} x Rp${fallbackPrice.toLocaleString("id-ID")} = Rp${trx.totalHarga.toLocaleString("id-ID")}`;
    }

    // Subtotal calculations: subtotal is total price minus rounding
    const subtotalVal = trx.totalHarga - pembulatanNominalExt;

    let subtotalLine = `Subtotal : Rp${subtotalVal.toLocaleString("id-ID")}\n`;
    let diskonLine = diskonNominalExt > 0 ? `Diskon : -Rp${diskonNominalExt.toLocaleString("id-ID")}\n` : "";
    let extraLine = extraFeesSum > 0 ? `Biaya Tambahan : Rp${extraFeesSum.toLocaleString("id-ID")}\n` : "";
    let pembulatanLine = pembulatanNominalExt !== 0 ? `Pembulatan : Rp${pembulatanNominalExt.toLocaleString("id-ID")}\n` : "";
    let totalLine = `Total : Rp${trx.totalHarga.toLocaleString("id-ID")}`;

    let paymentStatusDetails = "";
    const activeCust = customers.find(c => c.telepon === trx.customerPhone || c.nama === trx.customerName);
    const currentDepositVal = activeCust?.saldoDeposit || 0;

    if (trx.statusBayar === "Lunas") {
      paymentStatusDetails = `Status Bayar : *LUNAS* (${trx.pembayaranMetode})\n` +
                             `Sisa Pelunasan : Rp0`;
    } else if (trx.statusBayar === "DP") {
      const dpVal = trx.dpAmount || 0;
      const sisa = Math.max(0, trx.totalHarga - dpVal);
      paymentStatusDetails = `Status Bayar : *DP* (Masuk Rp${dpVal.toLocaleString("id-ID")})\n` +
                             `Sisa Pelunasan : -Rp${sisa.toLocaleString("id-ID")}`;
    } else {
      // Belum Lunas
      paymentStatusDetails = `Status Bayar : *BELUM LUNAS*\n` +
                             `Sisa Pelunasan : -Rp${trx.totalHarga.toLocaleString("id-ID")}`;
    }

    if (trx.pembayaranMetode === "Saldo Deposit" || (activeCust && activeCust.saldoDeposit !== undefined && activeCust.saldoDeposit > 0)) {
      paymentStatusDetails += `\nSisa Saldo Deposit : Rp${currentDepositVal.toLocaleString("id-ID")}`;
    }

    const divider = "------------------------------------";

    let text = `*${shopName}*\n` +
      `${shopAddress}\n` +
      `${shopPhone}\n\n` +
      `Buka : ${shopHours}\n` +
      `${divider}\n` +
      `Pelanggan : ${trx.customerName}\n` +
      `No. Transaksi : ${formatIdIndo(trx.id)}\n` +
      `Waktu : ${formatTanggalWhatsApp(trx.tanggalMasuk)}\n` +
      `Kasir : ${cashierName}\n` +
      `Estimasi Selesai : ${formatTanggalWhatsApp(trx.estimasiSelesai)}\n` +
      `Parfum : ${trx.parfum || "Dianamist"}\n` +
      `${divider}\n` +
      `*Layanan*\n` +
      `${layananFormatted}\n` +
      `${divider}\n` +
      `${subtotalLine}` +
      `${diskonLine}` +
      `${extraLine}` +
      `${pembulatanLine}` +
      `${totalLine}\n` +
      `${divider}\n` +
      `${paymentStatusDetails}`;

    if (outletConfig.ketentuanNota) {
      text += `\n${divider}\n*KETENTUAN*\n${outletConfig.ketentuanNota}`;
    }

    return text;
  };

  // Connect printer handler
  const handleConnectPrinter = async () => {
    try {
      const pName = await connectPrinter();
      setPrinterState({
        connected: true,
        name: pName,
        supported: true
      });
      showToast(`Terhubung dengan ${pName}!`);
    } catch (err: any) {
      if (err.name !== "NotFoundError" && err.name !== "AbortError") {
        alert("Gagal koneksi Bluetooth: " + (err.message || err));
      }
    }
  };

  // Disconnect printer handler
  const handleDisconnectPrinter = async () => {
    try {
      await disconnectPrinter();
      setPrinterState({
        connected: false,
        name: null,
        supported: isBluetoothSupported()
      });
      showToast("Printer Bluetooth terputus.");
    } catch (err: any) {
      showToast("Gagal memutuskan printer: " + err.message);
    }
  };

  // Real Print Handler
  const handleRealPrint = async (trx: LaundryTransaction, type: "nota" | "label") => {
    if (!isPrinterConnected()) {
      alert("Printer Bluetooth belum terhubung!");
      return;
    }
    
    setPrintingTrx(trx);
    setPrintType(type);
    setPrintingProgress(0);
    setIsPrintFinished(false);
    setBtsPrinting(true);

    try {
      let bytes: Uint8Array;
      if (type === "nota") {
        bytes = generateReceiptEscPos(trx, activeCashierName);
      } else {
        bytes = generateLabelEscPos(trx);
      }

      await sendToPrinter(bytes, (progress) => {
        setPrintingProgress(progress);
      });

      setIsPrintFinished(true);
      setBtsPrinting(false);
      showToast(`${type === "nota" ? "Nota" : "Label"} berhasil dicetak secara fisik!`);
    } catch (err: any) {
      setBtsPrinting(false);
      alert("Error saat mencetak: " + (err.message || err));
    }
  };

  // Simulate print for user who has no Bluetooth connected
  const handleStartSimulatedPrint = (trx: LaundryTransaction, type: "nota" | "label") => {
    setPrintingTrx(trx);
    setPrintType(type);
    setPrintingProgress(0);
    setIsPrintFinished(false);
    setBtsPrinting(false);

    let currentProg = 0;
    const interval = setInterval(() => {
      currentProg += 10;
      setPrintingProgress(currentProg);
      if (currentProg >= 100) {
        clearInterval(interval);
        setIsPrintFinished(true);
      }
    }, 120);
  };

  // New Transaction Form state
  const [selectedCustId, setSelectedCustId] = useState<string>("");
  const [customCustName, setCustomCustName] = useState<string>("");
  const [customCustPhone, setCustomCustPhone] = useState<string>("62");
  const [createCustInline, setCreateCustInline] = useState<boolean>(false);
  const [isSelectingCustBottomSheet, setIsSelectingCustBottomSheet] = useState<boolean>(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>("");

  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [trxWeight, setTrxWeight] = useState<number>(1);
  const [selectedParfum, setSelectedParfum] = useState<string>("Lavender Sensation");
  const [trxNotes, setTrxNotes] = useState<string>("");
  const [statusBayar, setStatusBayar] = useState<"Lunas" | "Belum Lunas">("Belum Lunas");
  const [paymentMethod, setPaymentMethod] = useState<"Tunai" | "QRIS" | "Transfer" | "Saldo Deposit">("Tunai");

  // Rich states for Screenshot 1: Tambah Transaksi layout matching
  const [pilihWaktuCustom, setPilihWaktuCustom] = useState<boolean>(false);
  const [customWaktuValue, setCustomWaktuValue] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [isTransaksiPaket, setIsTransaksiPaket] = useState<boolean>(false);
  const [isRekananLaundry, setIsRekananLaundry] = useState<boolean>(false);
  
  const [isAddingServiceInline, setIsAddingServiceInline] = useState<boolean>(false);
  const [tempServiceId, setTempServiceId] = useState<string>("");
  const [tempServiceWeight, setTempServiceWeight] = useState<string>("1");
  const [selectedLayananList, setSelectedLayananList] = useState<Array<{
    id: string;
    serviceId: string;
    nama: string;
    berat: number | string;
    harga: number;
    tipe: string;
  }>>([]);

  const [isAddingBiayaInline, setIsAddingBiayaInline] = useState<boolean>(false);
  const [tempBiayaNama, setTempBiayaNama] = useState<string>("");
  const [tempBiayaJumlah, setTempBiayaJumlah] = useState<number>(0);
  const [biayaTambahanList, setBiayaTambahanList] = useState<Array<{
    id: string;
    nama: string;
    jumlah: number;
  }>>([]);

  const [customEstimasiValue, setCustomEstimasiValue] = useState<string>("");
  const [showDiskonInput, setShowDiskonInput] = useState<boolean>(false);
  const [diskonNominal, setDiskonNominal] = useState<number>(0);
  const [isPembulatanActive, setIsPembulatanActive] = useState<boolean>(true);
  const [pembulatanTipe, setPembulatanTipe] = useState<"500" | "1000">("1000");
  const [serviceSearchQuery, setServiceSearchQuery] = useState<string>("");
  const [isSelectingServiceBottomSheet, setIsSelectingServiceBottomSheet] = useState<boolean>(false);

  // New Customer Form state
  const [newCustName, setNewCustName] = useState<string>("");
  const [newCustPhone, setNewCustPhone] = useState<string>("62");
  const [newCustAddress, setNewCustAddress] = useState<string>("");
  const [newCustPanggilan, setNewCustPanggilan] = useState<string>("");
  const [newCustParfum, setNewCustParfum] = useState<string>("");
  const [newCustLokasi, setNewCustLokasi] = useState<string>("");

  // New Service Form state
  const [newServName, setNewServName] = useState<string>("");
  
  // Inline Custom Parfum states for real-time perfume additions
  const [showInlineNewParfumForm, setShowInlineNewParfumForm] = useState<boolean>(false);
  const [inlineNewParfumName, setInlineNewParfumName] = useState<string>("");
  const [inlineContext, setInlineContext] = useState<"trx" | "cust" | "edit">("trx");

  const handleCreateInlineParfum = async (context: "trx" | "cust" | "edit") => {
    if (!inlineNewParfumName.trim()) return;
    const newName = inlineNewParfumName.trim();
    
    // Instantly append to localAddedParfums for instant responsiveness in forms
    const newLocalParfum: Parfum = {
      id: "PFM-LOCAL-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
      nama: newName,
      userId: activeOwnerId || "guest",
      createdAt: new Date().toISOString()
    };
    setLocalAddedParfums((prev) => [newLocalParfum, ...prev]);

    try {
      if (onAddParfum) {
        await onAddParfum(newName);
      } else {
        // Fallback for guest mode or offline setting
        parfums.push(newLocalParfum);
      }
      
      // Auto select the new parfum
      if (context === "trx") {
        setSelectedParfum(newName);
      } else if (context === "cust") {
        setNewCustParfum(newName);
      } else if (context === "edit") {
        setEditParfum(newName);
      }
      
      setInlineNewParfumName("");
      setShowInlineNewParfumForm(false);
    } catch (err) {
      alert("Gagal menambahkan parfum baru: " + String(err));
    }
  };
  const [newServType, setNewServType] = useState<string>("kg");
  const [newServPrice, setNewServPrice] = useState<number>(0);
  const [newServDuration, setNewServDuration] = useState<number>(48);

  // New Service Extra Form States (High fidelity matching screenshots)
  const [newServProses, setNewServProses] = useState<string[]>(["Cuci", "Pengeringan", "Setrika", "Lipat"]);
  const [newServDurationValue, setNewServDurationValue] = useState<number>(1);
  const [newServDurationTipe, setNewServDurationTipe] = useState<"Jam" | "Hari">("Hari");
  const [newServMinQty, setNewServMinQty] = useState<number>(1);
  const [newServCategory, setNewServCategory] = useState<string>("Reguler");
  const [newServSematkan, setNewServSematkan] = useState<boolean>(false);
  const [newServBahanBahan, setNewServBahanBahan] = useState<string[]>([]);
  const [isAddingBahanInline, setIsAddingBahanInline] = useState<boolean>(false);
  const [tempBahanNama, setTempBahanNama] = useState<string>("");
  const [categoryList, setCategoryList] = useState<string[]>(["Express", "Reguler", "Kilat"]);
  const [isAddingCategoryInline, setIsAddingCategoryInline] = useState<boolean>(false);
  const [tempCategoryNama, setTempCategoryNama] = useState<string>("");

  // Sheet modals (to match high fidelity bottom options screen designs)
  const [showSatuanSheet, setShowSatuanSheet] = useState<boolean>(false);
  const [showKategoriSheet, setShowKategoriSheet] = useState<boolean>(false);
  const [showDurasiTipeSheet, setShowDurasiTipeSheet] = useState<boolean>(false);

  React.useEffect(() => {
    if (showCreateModalDirectly) setIsCreatingTrx(true);
  }, [showCreateModalDirectly]);

  React.useEffect(() => {
    if (showCustomerModalDirectly) setIsCreatingCust(true);
  }, [showCustomerModalDirectly]);

  React.useEffect(() => {
    if (showServiceModalDirectly) setIsCreatingServ(true);
  }, [showServiceModalDirectly]);

  // Automatically calculate customEstimasiValue when selected items, custom transaction date or services change
  React.useEffect(() => {
    let baseDate = new Date();
    if (pilihWaktuCustom && customWaktuValue) {
      baseDate = new Date(customWaktuValue);
    }

    let maxDurationJam = 48; // Default to 48 hours is fallback

    if (selectedLayananList.length > 0) {
      maxDurationJam = 0;
      selectedLayananList.forEach((item) => {
        const matchingS = services.find((serv) => serv.id === item.serviceId);
        if (matchingS) {
          const itemDuration = matchingS.durasiJam || 48;
          if (itemDuration > maxDurationJam) {
            maxDurationJam = itemDuration;
          }
        }
      });
    } else if (selectedServiceId) {
      const matchingS = services.find((serv) => serv.id === selectedServiceId);
      if (matchingS) {
        maxDurationJam = matchingS.durasiJam || 48;
      }
    }

    if (maxDurationJam > 0) {
      const targetDate = new Date(baseDate.getTime() + maxDurationJam * 60 * 60 * 1000);
      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
      const dd = String(targetDate.getDate()).padStart(2, "0");
      const hh = String(targetDate.getHours()).padStart(2, "0");
      const min = String(targetDate.getMinutes()).padStart(2, "0");
      setCustomEstimasiValue(`${yyyy}-${mm}-${dd}T${hh}:${min}`);
    }
  }, [selectedLayananList, selectedServiceId, pilihWaktuCustom, customWaktuValue, services]);

  // Rich reactive calculations for subtotal, diskon, extra fields, roundings, and grand total:
  const servicesSubtotal = selectedLayananList.reduce((acc, curr) => {
    const beratNum = typeof curr.berat === "string" ? parseFloat(curr.berat.replace(",", ".")) || 0 : curr.berat;
    return acc + (curr.harga * beratNum);
  }, 0);
  const extraFeesTotal = biayaTambahanList.reduce((acc, curr) => acc + curr.jumlah, 0);
  const subtotalBeforeDiskon = servicesSubtotal + extraFeesTotal;
  const diskonValue = showDiskonInput ? diskonNominal : 0;
  const beforeRoundingTotal = Math.max(0, subtotalBeforeDiskon - diskonValue);
  
  // Calculate rounding so that total is rounded up to the nearest 1000 or 500
  const getRoundingValue = (amount: number) => {
    if (!isPembulatanActive) return 0;
    const step = pembulatanTipe === "1000" ? 1000 : 500;
    const remainder = amount % step;
    if (remainder === 0) return 0;
    return step - remainder; // Round up positive adjustment
  };
  const nominalPembulatan = getRoundingValue(beforeRoundingTotal);
  const grandTotalResult = beforeRoundingTotal + nominalPembulatan;

  // Handler: Calculate values block
  const currentService = services.find(s => s.id === selectedServiceId);
  const calculatedTotal = selectedLayananList.length > 0 ? grandTotalResult : (currentService ? (currentService.harga * trxWeight) + getRoundingValue(currentService.harga * trxWeight) : 0);

  // Filter list
  const trxToday = new Date();
  const trxTodayStr = `${trxToday.getFullYear()}-${String(trxToday.getMonth() + 1).padStart(2, "0")}-${String(trxToday.getDate()).padStart(2, "0")}`;
  const trxCurrentDateTimeStr = `${trxToday.getFullYear()}-${String(trxToday.getMonth() + 1).padStart(2, "0")}-${String(trxToday.getDate()).padStart(2, "0")} ${String(trxToday.getHours()).padStart(2, "0")}:${String(trxToday.getMinutes()).padStart(2, "0")}`;

  const isTrxOverdue = (estimasiStr: string) => {
    return estimasiStr < trxCurrentDateTimeStr;
  };

  const filteredTrx = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch = 
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.layananNama.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesDate = !dateFilter || t.tanggalMasuk.startsWith(dateFilter);
      const matchesStatus = statusFilter === "Semua" ? true : t.status === statusFilter;
      
      let matchesSpecial = true;
      if (specialFilter === "dueToday") {
        matchesSpecial = t.estimasiSelesai.startsWith(trxTodayStr) && t.status !== "Diambil";
      } else if (specialFilter === "overdue") {
        matchesSpecial = isTrxOverdue(t.estimasiSelesai) && t.status !== "Selesai" && t.status !== "Diambil";
      } else if (specialFilter === "lunasBulanIni") {
        const currentMonthStr = `${trxToday.getFullYear()}-${String(trxToday.getMonth() + 1).padStart(2, "0")}`;
        matchesSpecial = t.tanggalMasuk.startsWith(currentMonthStr) && t.statusBayar === "Lunas";
      } else if (specialFilter === "dpBulanIni") {
        const currentMonthStr = `${trxToday.getFullYear()}-${String(trxToday.getMonth() + 1).padStart(2, "0")}`;
        matchesSpecial = t.tanggalMasuk.startsWith(currentMonthStr) && t.statusBayar === "DP";
      } else if (specialFilter === "paketBulanIni") {
        const currentMonthStr = `${trxToday.getFullYear()}-${String(trxToday.getMonth() + 1).padStart(2, "0")}`;
        matchesSpecial = t.tanggalMasuk.startsWith(currentMonthStr) && t.statusBayar === "Lunas" && !!t.notes && t.notes.includes("[TRANSAKSI PAKET]");
      } else if (specialFilter === "semuaHutang") {
        matchesSpecial = t.statusBayar !== "Lunas";
      } else if (specialFilter === "dpHutang") {
        matchesSpecial = t.statusBayar === "DP";
      } else if (specialFilter === "belumLunasHutang") {
        matchesSpecial = t.statusBayar === "Belum Lunas";
      }
      
      return matchesSearch && matchesDate && matchesStatus && matchesSpecial;
    });
  }, [transactions, searchTerm, dateFilter, statusFilter, specialFilter, trxTodayStr, trxCurrentDateTimeStr]);

  // Helper to parse stored layanan string
  const parseLayananString = (layananNamaStr: string, layananIdStr: string, totalBerat: number, totalHarga: number): Array<{
    id: string;
    serviceId: string;
    nama: string;
    berat: number | string;
    harga: number;
    tipe: string;
  }> => {
    if (!layananNamaStr) return [];
    if (!layananNamaStr.includes("(")) {
      const matchS = services.find(s => s.id === layananIdStr || s.nama === layananNamaStr);
      return [{
        id: "L-EDIT-0",
        serviceId: matchS?.id || layananIdStr || "default",
        nama: layananNamaStr,
        berat: totalBerat,
        harga: matchS?.harga || (totalBerat > 0 ? Math.round(totalHarga / totalBerat) : totalHarga),
        tipe: matchS?.tipe || "Kiloan"
      }];
    }

    const items = layananNamaStr.split(", ");
    const list: any[] = [];
    items.forEach((item, index) => {
      const match = item.match(/^(.*?)\s*\(([\d.]+)\s*([a-zA-Z0-9]+)\)$/i);
      if (match) {
        const nama = match[1].trim();
        const berat = parseFloat(match[2].replace(",", ".")) || 1;
        const unit = match[3];
        const matchS = services.find(s => s.nama.toLowerCase() === nama.toLowerCase());
        let determinedType = matchS?.tipe;
        if (!determinedType) {
          const ul = unit.toLowerCase();
          if (ul.includes("pc") || ul === "satuan") {
            determinedType = "Satuan";
          } else if (ul === "m" || ul.includes("meter")) {
            determinedType = "Meter";
          } else if (ul.includes("set")) {
            determinedType = "Set";
          } else if (ul.includes("pasang")) {
            determinedType = "Pasang";
          } else if (ul.includes("lusin")) {
            determinedType = "Lusin";
          } else {
            determinedType = "Kiloan";
          }
        }
        list.push({
          id: `L-EDIT-${index}-${nama.replace(/\s+/g, "")}`,
          serviceId: matchS?.id || "default",
          nama: nama,
          berat: berat,
          harga: matchS?.harga || 0,
          tipe: determinedType
        });
      } else {
        list.push({
          id: `L-EDIT-${index}-${item.replace(/\s+/g, "")}`,
          serviceId: "default",
          nama: item,
          berat: 1,
          harga: 0,
          tipe: "Kiloan"
        });
      }
    });

    let zeroPrices = list.filter(x => x.harga === 0);
    if (zeroPrices.length > 0) {
      const known = list.reduce((s, x) => s + (x.harga * x.berat), 0);
      const diff = Math.max(0, totalHarga - known);
      list.forEach(x => {
        if (x.harga === 0) {
          x.harga = Math.round(diff / (x.berat * zeroPrices.length));
        }
      });
    }
    return list;
  };

  // Helper to convert 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DD HH:MM:SS' to 'YYYY-MM-DDTHH:MM'
  const parseToDatetimeLocal = (val: string): string => {
    if (!val) return "";
    const cleaned = val.trim();
    if (cleaned.includes("T")) {
      return cleaned.slice(0, 16);
    }
    const replaced = cleaned.replace(" ", "T");
    return replaced.slice(0, 16);
  };

  // Helper to convert 'YYYY-MM-DDTHH:MM' back to 'YYYY-MM-DD HH:MM'
  const parseFromDatetimeLocal = (val: string): string => {
    if (!val) return "";
    return val.trim().replace("T", " ");
  };

  const startEditTransaction = (trx: LaundryTransaction) => {
    setEditCustName(trx.customerName);
    setEditCustPhone(trx.customerPhone);
    setEditParfum(trx.parfum || "Lavender Sensation");
    setEditStatusBayar(trx.statusBayar);
    setEditPaymentMethod(trx.pembayaranMetode || "Tunai");
    setEditStatus(trx.status);
    setEditWaktuMasuk(trx.tanggalMasuk);
    setEditWaktuSelesai(trx.estimasiSelesai);
    
    // Parse notes for extra fields
    let rawNotes = trx.notes || "";
    setEditNotes(rawNotes);

    // Set cashier name automatically from logged in admin/owner/karyawan
    if (activeCashierName) {
      setEditCashier(activeCashierName);
    } else {
      // Extract cashier
      const cashierMatch = rawNotes.match(/\[Kasir:\s*([^\]]+)\]/);
      if (cashierMatch) {
        setEditCashier(cashierMatch[1]);
      } else {
        setEditCashier("Mba Dwi");
      }
    }

    // Extract added fees: (Biaya Tambahan: Delivery: Rp 5,000)
    const btList: any[] = [];
    const btMatch = rawNotes.match(/\(Biaya Tambahan:\s*([^)]+)\)/);
    if (btMatch) {
      const parts = btMatch[1].split(", ");
      parts.forEach(p => {
        const itemParts = p.split(": Rp ");
        if (itemParts.length >= 2) {
          btList.push({
            id: "B-EDIT-" + Math.random().toString().slice(-4),
            nama: itemParts[0].trim(),
            jumlah: parseInt(itemParts[1].replace(/[,.]/g, ""), 10) || 0
          });
        }
      });
    }
    setEditBiayaTambahan(btList);

    // Extract discount: (Diskon: Rp 5,000)
    const diskMatch = rawNotes.match(/\(Diskon:\s*Rp\s*([\d,.]+)\)/);
    if (diskMatch) {
      setEditDiskonNominal(parseInt(diskMatch[1].replace(/[,.]/g, ""), 10) || 0);
      setEditShowDiskonInput(true);
    } else {
      setEditDiskonNominal(0);
      setEditShowDiskonInput(false);
    }

    // Parse services
    const layanans = parseLayananString(trx.layananNama, trx.layananId, trx.berat, trx.totalHarga);
    setEditSelectedLayanan(layanans);
    setIsEditingTrx(true);
  };

  // Rich reactive calculations for edit flow
  const editServicesSubtotal = editSelectedLayanan.reduce((acc, curr) => {
    const bVal = typeof curr.berat === "string" ? parseFloat(curr.berat.replace(",", ".")) || 0 : curr.berat;
    return acc + (curr.harga * bVal);
  }, 0);
  const editExtraFeesTotal = editBiayaTambahan.reduce((acc, curr) => acc + curr.jumlah, 0);
  const editSubtotalBeforeDiskon = editServicesSubtotal + editExtraFeesTotal;
  const editDiskonValue = editShowDiskonInput ? editDiskonNominal : 0;
  const editBeforeRoundingTotal = Math.max(0, editSubtotalBeforeDiskon - editDiskonValue);
  
  const getEditRoundingValue = (amount: number) => {
    if (!editIsPembulatanActive) return 0;
    const step = editPembulatanTipe === "1000" ? 1000 : 500;
    const remainder = amount % step;
    if (remainder === 0) return 0;
    return step - remainder;
  };
  const editNominalPembulatan = getEditRoundingValue(editBeforeRoundingTotal);
  const editGrandTotalResult = editBeforeRoundingTotal + editNominalPembulatan;

  const saveEditedTransaction = async () => {
    if (!selectedDetailTrx) return;
    
    // Check fields
    if (!editCustName || !editCustPhone) {
      alert("Nama Pelanggan dan No HP wajib diisi.");
      return;
    }

    if (editSelectedLayanan.length === 0) {
      alert("Layanan laundry tidak boleh kosong.");
      return;
    }

    // Build layanan nama, berat, total-harga
    const finalLayananId = editSelectedLayanan[0].serviceId;
    const finalLayananNama = editSelectedLayanan.map(item => {
      const bVal = typeof item.berat === "string" ? parseFloat(item.berat.replace(",", ".")) || 0 : item.berat;
      return `${item.nama} (${bVal} ${getServiceUnitText(item.nama, item.tipe)})`;
    }).join(", ");

    const finalBerat = editSelectedLayanan.reduce((acc, curr) => {
      const bVal = typeof curr.berat === "string" ? parseFloat(curr.berat.replace(",", ".")) || 0 : curr.berat;
      return acc + bVal;
    }, 0);

    // Filter notes: strip previous auxiliary tags
    let cleanNotes = editNotes
      .replace(/\(Biaya Tambahan:\s*([^)]*)\)/g, "")
      .replace(/\(Diskon:\s*Rp\s*[\d,.]*\)/g, "")
      .replace(/\(Pembulatan:\s*Rp\s*[\d,.]*\)/g, "")
      .replace(/\[Kasir:\s*([^\]]*)]/g, "")
      .trim();

    // Re-append auxiliary descriptors
    if (editCashier) {
      cleanNotes = `[Kasir: ${editCashier}] ` + cleanNotes;
    }
    if (editBiayaTambahan.length > 0) {
      const extraFeesString = editBiayaTambahan.map(item => `${item.nama}: Rp ${item.jumlah.toLocaleString("id-ID")}`).join(", ");
      cleanNotes = cleanNotes + ` (Biaya Tambahan: ${extraFeesString})`;
    }
    if (editDiskonNominal > 0 && editShowDiskonInput) {
      cleanNotes = cleanNotes + ` (Diskon: Rp ${editDiskonNominal.toLocaleString("id-ID")})`;
    }
    if (editNominalPembulatan !== 0) {
      cleanNotes = cleanNotes + ` (Pembulatan: Rp ${editNominalPembulatan.toLocaleString("id-ID")})`;
    }

    const updates: Partial<LaundryTransaction> = {
      customerName: editCustName,
      customerPhone: editCustPhone,
      layananId: finalLayananId,
      layananNama: finalLayananNama,
      berat: finalBerat,
      totalHarga: editGrandTotalResult,
      parfum: editParfum,
      status: editStatus,
      statusBayar: editStatusBayar,
      pembayaranMetode: editPaymentMethod,
      tanggalMasuk: editWaktuMasuk,
      estimasiSelesai: editWaktuSelesai,
      notes: cleanNotes || undefined
    };

    try {
      await onUpdateTransaction(selectedDetailTrx.id, updates);
      
      // Update local state in view
      const updatedTrx = {
        ...selectedDetailTrx,
        ...updates
      } as LaundryTransaction;
      
      setSelectedDetailTrx(updatedTrx);
      setIsEditingTrx(false);
    } catch (err) {
      alert("Gagal merubah transaksi: " + String(err));
    }
  };

  const handleUpdateWeightInline = async (serviceIdInTrxStr: string, newWeight: number) => {
    if (!selectedDetailTrx) return;
    
    // Parse current services
    const currentServices = parseLayananString(
      selectedDetailTrx.layananNama, 
      selectedDetailTrx.layananId, 
      selectedDetailTrx.berat, 
      selectedDetailTrx.totalHarga
    );

    // Find and update package weight
    const updatedServices = currentServices.map(s => {
      if (s.id === serviceIdInTrxStr) {
        return { ...s, berat: newWeight };
      }
      return s;
    });

    // Recompute total price dynamically using standard formula or the stored prices
    const subtotal = updatedServices.reduce((sum, item) => {
      const bVal = typeof item.berat === "string" ? parseFloat(item.berat.replace(",", ".")) || 0 : item.berat;
      return sum + (item.harga * bVal);
    }, 0);

    // Extract any existing extra fees or discounts from the transaction's notes
    let btTotal = 0;
    const rawNotes = selectedDetailTrx.notes || "";
    const btMatch = rawNotes.match(/\(Biaya Tambahan:\s*([^)]+)\)/);
    if (btMatch) {
      const parts = btMatch[1].split(", ");
      parts.forEach(p => {
        const itemParts = p.split(": Rp ");
        if (itemParts.length >= 2) {
          btTotal += parseInt(itemParts[1].replace(/[,.]/g, ""), 10) || 0;
        }
      });
    }

    let discountNom = 0;
    const diskMatch = rawNotes.match(/\(Diskon:\s*Rp\s*([\d,.]+)\)/);
    if (diskMatch) {
      discountNom = parseInt(diskMatch[1].replace(/[,.]/g, ""), 10) || 0;
    }

    const beforeRounding = Math.max(0, subtotal + btTotal - discountNom);
    const rounding = getRoundingValue(beforeRounding);
    const finalTotal = beforeRounding + rounding;

    // Compile updated label and weight parameters
    const finalLayananNama = updatedServices.map(item => {
      const bVal = typeof item.berat === "string" ? parseFloat(item.berat.replace(",", ".")) || 0 : item.berat;
      return `${item.nama} (${bVal} ${getServiceUnitText(item.nama, item.tipe)})`;
    }).join(", ");

    const finalBerat = updatedServices.reduce((acc, curr) => {
      const bVal = typeof curr.berat === "string" ? parseFloat(curr.berat.replace(",", ".")) || 0 : curr.berat;
      return acc + bVal;
    }, 0);

    // Filter notes to strip old pembulatan, and append new rounding if any
    let cleanNotes = rawNotes
      .replace(/\(Pembulatan:\s*Rp\s*[\d,.]*\)/g, "")
      .trim();
    if (rounding !== 0) {
      cleanNotes = cleanNotes + ` (Pembulatan: Rp ${rounding.toLocaleString("id-ID")})`;
    }

    const updates: Partial<LaundryTransaction> = {
      layananNama: finalLayananNama,
      berat: finalBerat,
      totalHarga: finalTotal,
      notes: cleanNotes || undefined
    };

    try {
      await onUpdateTransaction(selectedDetailTrx.id, updates);
      
      const updatedTrx = {
        ...selectedDetailTrx,
        ...updates
      } as LaundryTransaction;
      
      setSelectedDetailTrx(updatedTrx);
      setEditingServiceIdInline(null);
    } catch (err) {
      alert("Gagal merubah kuantitas: " + String(err));
    }
  };

  const handleUpdateServiceInline = async (serviceIdInTrxStr: string, newServiceId: string, newWeight: number) => {
    if (!selectedDetailTrx) return;
    
    // Parse current services in the transaction
    const currentServices = parseLayananString(
      selectedDetailTrx.layananNama, 
      selectedDetailTrx.layananId, 
      selectedDetailTrx.berat, 
      selectedDetailTrx.totalHarga
    );

    // Find the replacement service in masters
    const targetServiceMaster = services.find(s => s.id === newServiceId);
    if (!targetServiceMaster) {
      alert("Layanan tidak ditemukan!");
      return;
    }

    // Find and update package service type and weight/quantity
    const updatedServices = currentServices.map(s => {
      if (s.id === serviceIdInTrxStr) {
        return { 
          ...s, 
          serviceId: targetServiceMaster.id,
          nama: targetServiceMaster.nama,
          harga: targetServiceMaster.harga,
          tipe: targetServiceMaster.tipe,
          berat: newWeight 
        };
      }
      return s;
    });

    // Recompute subtotal
    const subtotal = updatedServices.reduce((sum, item) => {
      const bVal = typeof item.berat === "string" ? parseFloat(item.berat.replace(",", ".")) || 0 : item.berat;
      return sum + (item.harga * bVal);
    }, 0);

    // Extract any existing extra fees or discounts from the transaction's notes
    let btTotal = 0;
    const rawNotes = selectedDetailTrx.notes || "";
    const btMatch = rawNotes.match(/\(Biaya Tambahan:\s*([^)]+)\)/);
    if (btMatch) {
      const parts = btMatch[1].split(", ");
      parts.forEach(p => {
        const itemParts = p.split(": Rp ");
        if (itemParts.length >= 2) {
          btTotal += parseInt(itemParts[1].replace(/[,.]/g, ""), 10) || 0;
        }
      });
    }

    let discountNom = 0;
    const diskMatch = rawNotes.match(/\(Diskon:\s*Rp\s*([\d,.]+)\)/);
    if (diskMatch) {
      discountNom = parseInt(diskMatch[1].replace(/[,.]/g, ""), 10) || 0;
    }

    const beforeRounding = Math.max(0, subtotal + btTotal - discountNom);
    const rounding = getRoundingValue(beforeRounding);
    const finalTotal = beforeRounding + rounding;

    // Compile updated label and weight parameters
    const finalLayananNama = updatedServices.map(item => {
      const bVal = typeof item.berat === "string" ? parseFloat(item.berat.replace(",", ".")) || 0 : item.berat;
      return `${item.nama} (${bVal} ${getServiceUnitText(item.nama, item.tipe)})`;
    }).join(", ");

    const finalBerat = updatedServices.reduce((acc, curr) => {
      const bVal = typeof curr.berat === "string" ? parseFloat(curr.berat.replace(",", ".")) || 0 : curr.berat;
      return acc + bVal;
    }, 0);

    const finalLayananId = updatedServices.map(item => item.serviceId).join(",");

    // Filter notes to strip old pembulatan, and append new rounding if any
    let cleanNotes = rawNotes
      .replace(/\(Pembulatan:\s*Rp\s*[\d,.]*\)/g, "")
      .trim();
    if (rounding !== 0) {
      cleanNotes = cleanNotes + ` (Pembulatan: Rp ${rounding.toLocaleString("id-ID")})`;
    }

    const updates: Partial<LaundryTransaction> = {
      layananNama: finalLayananNama,
      layananId: finalLayananId,
      berat: finalBerat,
      totalHarga: finalTotal,
      notes: cleanNotes || undefined
    };

    try {
      await onUpdateTransaction(selectedDetailTrx.id, updates);
      
      const updatedTrx = {
        ...selectedDetailTrx,
        ...updates
      } as LaundryTransaction;
      
      setSelectedDetailTrx(updatedTrx);
      setEditingServiceIdInline(null);
      showToast("Layanan berhasil diperbarui!");
    } catch (err) {
      alert("Gagal merubah transaksi: " + String(err));
    }
  };

  const handleDeleteServiceInline = async (serviceIdInTrxStr: string) => {
    if (!selectedDetailTrx) return;

    const currentServices = parseLayananString(
      selectedDetailTrx.layananNama, 
      selectedDetailTrx.layananId, 
      selectedDetailTrx.berat, 
      selectedDetailTrx.totalHarga
    );

    if (currentServices.length <= 1) {
      alert("Transaksi harus memiliki minimal 1 layanan!");
      return;
    }

    const updatedServices = currentServices.filter(s => s.id !== serviceIdInTrxStr);

    // Recompute subtotal
    const subtotal = updatedServices.reduce((sum, item) => {
      const bVal = typeof item.berat === "string" ? parseFloat(item.berat.replace(",", ".")) || 0 : item.berat;
      return sum + (item.harga * bVal);
    }, 0);

    // Extract any existing extra fees or discounts from the transaction's notes
    let btTotal = 0;
    const rawNotes = selectedDetailTrx.notes || "";
    const btMatch = rawNotes.match(/\(Biaya Tambahan:\s*([^)]+)\)/);
    if (btMatch) {
      const parts = btMatch[1].split(", ");
      parts.forEach(p => {
        const itemParts = p.split(": Rp ");
        if (itemParts.length >= 2) {
          btTotal += parseInt(itemParts[1].replace(/[,.]/g, ""), 10) || 0;
        }
      });
    }

    let discountNom = 0;
    const diskMatch = rawNotes.match(/\(Diskon:\s*Rp\s*([\d,.]+)\)/);
    if (diskMatch) {
      discountNom = parseInt(diskMatch[1].replace(/[,.]/g, ""), 10) || 0;
    }

    const beforeRounding = Math.max(0, subtotal + btTotal - discountNom);
    const rounding = getRoundingValue(beforeRounding);
    const finalTotal = beforeRounding + rounding;

    // Compile updated label and weight parameters
    const finalLayananNama = updatedServices.map(item => {
      const bVal = typeof item.berat === "string" ? parseFloat(item.berat.replace(",", ".")) || 0 : item.berat;
      return `${item.nama} (${bVal} ${getServiceUnitText(item.nama, item.tipe)})`;
    }).join(", ");

    const finalBerat = updatedServices.reduce((acc, curr) => {
      const bVal = typeof curr.berat === "string" ? parseFloat(curr.berat.replace(",", ".")) || 0 : curr.berat;
      return acc + bVal;
    }, 0);

    const finalLayananId = updatedServices.map(item => item.serviceId).join(",");

    // Filter notes to strip old pembulatan, and append new rounding if any
    let cleanNotes = rawNotes
      .replace(/\(Pembulatan:\s*Rp\s*[\d,.]*\)/g, "")
      .trim();
    if (rounding !== 0) {
      cleanNotes = cleanNotes + ` (Pembulatan: Rp ${rounding.toLocaleString("id-ID")})`;
    }

    const updates: Partial<LaundryTransaction> = {
      layananNama: finalLayananNama,
      layananId: finalLayananId,
      berat: finalBerat,
      totalHarga: finalTotal,
      notes: cleanNotes || undefined
    };

    if (window.confirm("Apakah Anda yakin ingin menghapus layanan ini dari transaksi?")) {
      try {
        await onUpdateTransaction(selectedDetailTrx.id, updates);
        
        const updatedTrx = {
          ...selectedDetailTrx,
          ...updates
        } as LaundryTransaction;
        
        setSelectedDetailTrx(updatedTrx);
        showToast("Layanan berhasil dihapus!");
      } catch (err) {
        alert("Gagal menghapus layanan: " + String(err));
      }
    }
  };

  const handleSavePayment = async (trx: LaundryTransaction) => {
    const isLunas = paymentStatus === "Lunas";
    const mappedStatusBayar = isLunas ? "Lunas" : "DP";
    
    const dpAmt = !isLunas ? (parseInt(paymentDpAmountValue.replace(/[^0-9]/g, ""), 10) || 0) : undefined;

    if (!isLunas && dpAmt <= 0) {
      alert("Nominal pembayaran DP wajib lebih dari Rp 0!");
      return;
    }

    if (!isLunas && dpAmt >= trx.totalHarga) {
      alert("Nominal DP sama atau melebihi total tagihan! Silakan pilih status Lunas.");
      return;
    }

    // Check if paying with Saldo Deposit
    if (paymentMethodValue === "Saldo Deposit") {
      const activeCust = customers.find(c => c.telepon === trx.customerPhone || c.nama === trx.customerName);
      const amountToPay = isLunas 
        ? (trx.statusBayar === "DP" ? (trx.totalHarga - (trx.dpAmount || 0)) : trx.totalHarga)
        : (dpAmt || 0);

      if (!activeCust) {
        alert("Pilih pelanggan terlebih dahulu atau pastikan data pelanggan terhubung untuk pembayaran menggunakan Saldo Deposit!");
        return;
      }

      if ((activeCust.saldoDeposit || 0) < amountToPay) {
        alert(`Saldo deposit pelanggan (${activeCust.saldoDeposit ? "Rp " + activeCust.saldoDeposit.toLocaleString("id-ID") : "Rp 0"}) tidak mencukupi untuk pembayaran sebesar Rp ${amountToPay.toLocaleString("id-ID")}! Silakan isi ulang saldo pelanggan.`);
        return;
      }

      // Deduct balance
      const newBalance = (activeCust.saldoDeposit || 0) - amountToPay;
      if (onUpdateCustomer) {
        await onUpdateCustomer({
          ...activeCust,
          saldoDeposit: newBalance
        });
      }
    }
    
    // We can save/log the kas book and payment date inside notes or keep it structured.
    // Let's strip any existing [Kas: ...] and [Bayar: ...] logs first and append the new ones.
    let baseNotes = (trx.notes || "")
      .replace(/\[Kas:\s*[^\]]+\]/g, "")
      .replace(/\[Bayar:\s*[^\]]+\]/g, "")
      .trim();

    if (paymentBukuKas) {
      baseNotes = baseNotes ? `${baseNotes} [Kas: ${paymentBukuKas}]` : `[Kas: ${paymentBukuKas}]`;
    }
    if (paymentDate) {
      baseNotes = baseNotes ? `${baseNotes} [Bayar: ${paymentDate}]` : `[Bayar: ${paymentDate}]`;
    }

    const updates: Partial<LaundryTransaction> = {
      statusBayar: mappedStatusBayar,
      pembayaranMetode: paymentMethodValue,
      dpAmount: dpAmt,
      notes: baseNotes || undefined
    };

    try {
      await onUpdateTransaction(trx.id, updates);
      setSelectedDetailTrx({
        ...trx,
        ...updates
      });
      setShowPaymentSheet(false);
      showToast(`Pembayaran berhasil disimpan sebagai ${paymentStatus === "DP" ? "DP" : "Lunas"}!`);
    } catch (err) {
      alert("Gagal menyimpan pembayaran: " + String(err));
    }
  };

  const handleCancelPayment = async (trx: LaundryTransaction) => {
    const confirmCancel = window.confirm(
      `Apakah Anda yakin ingin membatalkan pembayaran untuk transaksi ini?\n\n- No Nota: ${trx.id}\n- Pelanggan: ${trx.customerName}\n\nStatus pembayaran akan dikembalikan menjadi "Belum Lunas" dan nominal uang muka (DP) akan dihapus.`
    );
    if (!confirmCancel) return;

    let baseNotes = (trx.notes || "")
      .replace(/\[Kas:\s*[^\]]+\]/g, "")
      .replace(/\[Bayar:\s*[^\]]+\]/g, "")
      .trim();

    const updates: Partial<LaundryTransaction> = {
      statusBayar: "Belum Lunas",
      dpAmount: undefined,
      notes: baseNotes || undefined
    };

    try {
      await onUpdateTransaction(trx.id, updates);
      setSelectedDetailTrx({
        ...trx,
        ...updates
      });
      setShowPaymentSheet(false);
      showToast("Pembayaran berhasil dibatalkan (Belum Lunas)!");
    } catch (err) {
      alert("Gagal membatalkan pembayaran: " + String(err));
    }
  };

  // Actions trigger list:
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOwnerId) {
      alert("Database error: Silakan login terlebih dahulu.");
      return;
    }

    let resolvedCustName = "";
    let resolvedCustPhone = "";

    if (createCustInline) {
      if (!customCustName || !customCustPhone) {
        alert("Nama Pelanggan dan No HP wajib diisi.");
        return;
      }
      
      const newCustId = "CUST-" + Date.now().toString().slice(-6);
      const newCust: Customer = {
        id: newCustId,
        nama: customCustName,
        telepon: customCustPhone,
        userId: activeOwnerId,
        createdAt: new Date().toISOString()
      };
      
      await onAddCustomer(newCust);
      resolvedCustName = customCustName;
      resolvedCustPhone = customCustPhone;
    } else {
      const selected = customers.find(c => c.id === selectedCustId);
      if (!selected) {
        alert("Pilih pelanggan terlebih dahulu.");
        return;
      }
      resolvedCustName = selected.nama;
      resolvedCustPhone = selected.telepon;
    }

    const choosenService = services.find(s => s.id === selectedServiceId);

    // Parse the actual transaction time
    let baseTime = new Date();
    if (pilihWaktuCustom && customWaktuValue) {
      baseTime = new Date(customWaktuValue);
    }
    const yy = baseTime.getFullYear().toString().slice(-2);
    const mm = String(baseTime.getMonth() + 1).padStart(2, "0");
    const dd = String(baseTime.getDate()).padStart(2, "0");
    const numSuffix = Math.floor(10000 + Math.random() * 90000).toString(); // Secure serial
    const trxId = `TRX-${yy}${mm}${dd}-${numSuffix}`;

    const tanggalMasuk = `${baseTime.getFullYear()}-${String(baseTime.getMonth()+1).padStart(2,"0")}-${String(baseTime.getDate()).padStart(2,"0")} ` +
                          `${String(baseTime.getHours()).padStart(2,"0")}:${String(baseTime.getMinutes()).padStart(2,"0")}`;

    // Estimated completion time
    let compTime = new Date(baseTime.getTime() + 48 * 60 * 60 * 1000); // 48 hours default estimate
    if (customEstimasiValue) {
      compTime = new Date(customEstimasiValue);
    } else if (selectedLayananList.length > 0) {
      let maxDuration = 48;
      selectedLayananList.forEach(item => {
        const matchingS = services.find(serv => serv.id === item.serviceId);
        if (matchingS && matchingS.durasiJam > maxDuration) {
          maxDuration = matchingS.durasiJam;
        }
      });
      compTime = new Date(baseTime.getTime() + maxDuration * 60 * 60 * 1000);
    } else if (choosenService) {
      compTime = new Date(baseTime.getTime() + choosenService.durasiJam * 60 * 60 * 1000);
    }
    const estimasiSelesai = `${compTime.getFullYear()}-${String(compTime.getMonth()+1).padStart(2,"0")}-${String(compTime.getDate()).padStart(2,"0")} ` +
                            `${String(compTime.getHours()).padStart(2,"0")}:${String(compTime.getMinutes()).padStart(2,"0")}`;

    // Compute details for storing in the core database
    let finalLayananId = "";
    let finalLayananNama = "";
    let finalBerat = 1;

    if (selectedLayananList.length > 0) {
      finalLayananId = selectedLayananList[0].serviceId;
      finalLayananNama = selectedLayananList.map(item => {
        const bVal = typeof item.berat === "string" ? parseFloat(item.berat.replace(",", ".")) || 0 : item.berat;
        return `${item.nama} (${bVal} ${getServiceUnitText(item.nama, item.tipe)})`;
      }).join(", ");
      finalBerat = selectedLayananList.reduce((acc, curr) => {
        const bVal = typeof curr.berat === "string" ? parseFloat(curr.berat.replace(",", ".")) || 0 : curr.berat;
        return acc + bVal;
      }, 0);
    } else if (choosenService) {
      finalLayananId = choosenService.id;
      finalLayananNama = choosenService.nama;
      finalBerat = trxWeight;
    } else {
      alert("Silakan tambahkan layanan laundry terlebih dahulu.");
      return;
    }

    // Embed extra metadata into notes securely to not lose transparency
    let finalNotes = trxNotes;
    if (isTransaksiPaket) {
      finalNotes = "[TRANSAKSI PAKET] " + finalNotes;
    }
    if (isRekananLaundry) {
      finalNotes = "[REKANAN LAUNDRY] " + finalNotes;
    }
    if (biayaTambahanList.length > 0) {
      const extraFeesString = biayaTambahanList.map(item => `${item.nama}: Rp ${item.jumlah.toLocaleString("id-ID")}`).join(", ");
      finalNotes = finalNotes + ` (Biaya Tambahan: ${extraFeesString})`;
    }
    if (diskonNominal > 0) {
      finalNotes = finalNotes + ` (Diskon: Rp ${diskonNominal.toLocaleString("id-ID")})`;
    }
    if (nominalPembulatan !== 0) {
      finalNotes = finalNotes + ` (Pembulatan: Rp ${nominalPembulatan.toLocaleString("id-ID")})`;
    }

    const newTrx: LaundryTransaction = {
      id: trxId,
      customerName: resolvedCustName,
      customerPhone: resolvedCustPhone,
      layananId: finalLayananId,
      layananNama: finalLayananNama,
      parfum: selectedParfum,
      berat: finalBerat,
      totalHarga: calculatedTotal,
      status: "Antrian",
      statusBayar: statusBayar,
      pembayaranMetode: paymentMethod,
      tanggalMasuk,
      estimasiSelesai,
      notes: finalNotes || undefined,
      userId: activeOwnerId
    };

    // Validate if paying with Saldo Deposit
    if (paymentMethod === "Saldo Deposit") {
      const trxCust = customers.find(c => c.id === selectedCustId);
      if (!trxCust) {
        alert("Pilih pelanggan terdaftar terlebih dahulu untuk melakukan pembayaran menggunakan Saldo Deposit!");
        return;
      }
      
      const amountToPay = statusBayar === "Lunas" ? calculatedTotal : 0;
      if (amountToPay > 0) {
        if ((trxCust.saldoDeposit || 0) < amountToPay) {
          alert(`Saldo deposit pelanggan (${trxCust.saldoDeposit ? "Rp " + trxCust.saldoDeposit.toLocaleString("id-ID") : "Rp 0"}) tidak mencukupi untuk pembayaran sebesar Rp ${amountToPay.toLocaleString("id-ID")}! Silakan isi ulang saldo pelanggan.`);
          return;
        }

        // Deduct balance
        const newBalance = (trxCust.saldoDeposit || 0) - amountToPay;
        if (onUpdateCustomer) {
          await onUpdateCustomer({
            ...trxCust,
            saldoDeposit: newBalance
          });
        }
      } else {
        alert("Pembayaran dengan Saldo Deposit hanya berlaku untuk status pembayaran Lunas.");
        return;
      }
    }

    await onAddTransaction(newTrx);
    
    // Reset fields
    setSelectedCustId("");
    setCustomCustName("");
    setCustomCustPhone("62");
    setCreateCustInline(false);
    setSelectedServiceId("");
    setTrxWeight(1);
    setTrxNotes("");
    setStatusBayar("Belum Lunas");
    
    // Reset additional high fidelity states
    setPilihWaktuCustom(false);
    setIsTransaksiPaket(false);
    setIsRekananLaundry(false);
    setSelectedLayananList([]);
    setBiayaTambahanList([]);
    setCustomEstimasiValue("");
    setShowDiskonInput(false);
    setDiskonNominal(0);
    setIsPembulatanActive(true);

    setIsCreatingTrx(false);
    if (onCloseCreateModalDirectly) onCloseCreateModalDirectly();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOwnerId) return;
    if (!newCustName) {
      alert("Nama wajib diisi!");
      return;
    }

    const newId = "CUST-" + Date.now().toString().slice(-6);
    const newCust: Customer = {
      id: newId,
      nama: newCustName,
      telepon: newCustPhone || "-",
      alamat: newCustAddress || "",
      userId: activeOwnerId,
      createdAt: new Date().toISOString()
    };

    if (newCustPanggilan) {
      newCust.panggilan = newCustPanggilan;
    }
    if (newCustParfum) {
      newCust.parfumFavorit = newCustParfum;
      setSelectedParfum(newCustParfum);
    }
    if (newCustLokasi) {
      newCust.lokasiAntarJemput = newCustLokasi;
    }

    await onAddCustomer(newCust);
    setSelectedCustId(newId);
    setCreateCustInline(false);

    setNewCustName("");
    setNewCustPhone("62");
    setNewCustAddress("");
    setNewCustPanggilan("");
    setNewCustParfum("");
    setNewCustLokasi("");
    setIsCreatingCust(false);
    
    if (onCloseCustomerModalDirectly) onCloseCustomerModalDirectly();
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOwnerId) return;
    if (!newServName || newServPrice <= 0) return;

    const calculatedDurasiJam = newServDurationTipe === "Hari" ? (newServDurationValue * 24) : newServDurationValue;
    const newId = "SERV-" + Date.now().toString().slice(-6);
    const newService: Service = {
      id: newId,
      nama: newServName,
      tipe: newServType || "kg",
      harga: newServPrice,
      durasiJam: calculatedDurasiJam,
      userId: activeOwnerId,
      proses: newServProses,
      durasiValue: newServDurationValue,
      durasiTipe: newServDurationTipe,
      minimalKuantitas: newServMinQty,
      kategori: newServCategory,
      sematkan: newServSematkan,
      bahanBahan: newServBahanBahan
    };

    await onAddService(newService);
    setTempServiceId(newId);
    setServiceSearchQuery("");
    setNewServName("");
    setNewServType("kg");
    setNewServPrice(0);
    setNewServDurationValue(1);
    setNewServDurationTipe("Hari");
    setNewServMinQty(1);
    setNewServCategory("Reguler");
    setNewServSematkan(false);
    setNewServBahanBahan([]);
    setIsCreatingServ(false);

    if (onCloseServiceModalDirectly) onCloseServiceModalDirectly();
  };

  // Printing Trigger simulator
  const startPrintSimulation = (trx: LaundryTransaction) => {
    setPrintingTrx(trx);
    setPrintingProgress(0);
    setIsPrintFinished(false);

    const interval = setInterval(() => {
      setPrintingProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsPrintFinished(true);
          return 100;
        }
        return prev + 20;
      });
    }, 250);
  };

  // WhatsApp formatted receipt launcher
  const sendWhatsAppReceipt = (trx: LaundryTransaction) => {
    const formattedPhone = trx.customerPhone.replace(/[^0-9]/g, "");
    const waPhone = formattedPhone.startsWith("0") ? "62" + formattedPhone.substring(1) : formattedPhone;

    const messageText = generateWhatsAppReceiptText(trx);

    const encoded = encodeURIComponent(messageText);
    const targetUrl = `https://api.whatsapp.com/send?phone=${waPhone}&text=${encoded}`;
    window.open(targetUrl, "_blank");
  };

  const updateStatusFlow = async (id: string, currentStatus: string) => {
    let nextStatus: "Antrian" | "Proses" | "Selesai" | "Diambil" | "Batal" = "Antrian";
    let updates: Partial<LaundryTransaction> = {};

    if (currentStatus === "Antrian") {
      nextStatus = "Proses";
    } else if (currentStatus === "Proses") {
      nextStatus = "Selesai";
      updates.tanggalSelesai = new Date().toISOString();
    } else if (currentStatus === "Selesai") {
      nextStatus = "Diambil";
      updates.tanggalDiambil = new Date().toISOString();
      updates.statusBayar = "Lunas"; // auto reconcile
    }

    updates.status = nextStatus;
    
    await onUpdateTransaction(id, updates);
  };

  // Format amount to local IDR
  const formatIDR = (val: number) => {
    return "Rp " + val.toLocaleString("id-ID");
  };

  const formatTanggal = (dateStr?: string): string => {
    if (!dateStr) return "";
    const cleaned = dateStr.trim();
    const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
    if (match) {
      const [_, year, month, day, rest] = match;
      const timePart = rest.replace("T", " ").trim();
      return `${day}-${month}-${year}${timePart ? " " + timePart : ""}`;
    }
    return dateStr;
  };

  // Floating notice notification state to provide premium feedback during copies/sharing
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  
  const showToast = (message: string) => {
    setToastMsg(message);
    setTimeout(() => {
      setToastMsg(null);
    }, 2000);
  };

  const renderActionSheet = (trx: LaundryTransaction) => {
    return (
      <div className="absolute inset-0 bg-black/85 backdrop-blur-xs z-50 flex flex-col justify-end p-0 font-sans animate-fade-in text-left">
        <div 
          className="absolute inset-0" 
          onClick={() => setShowDetailActionsSheet(false)}
        />
        <div className="w-full max-w-[420px] mx-auto bg-[#121214] border-t border-[#27272A] rounded-t-2xl shadow-2xl relative z-10 flex flex-col max-h-[85vh] overflow-hidden pb-6">
          <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto my-3 shrink-0" />
          
          <div className="px-5 pb-3 flex items-center justify-between border-b border-zinc-900/60 shrink-0">
            <h4 className="text-base font-bold text-white text-center w-full relative">
              Opsi Transaksi
              <button 
                type="button"
                onClick={() => setShowDetailActionsSheet(false)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </h4>
          </div>

          <div className="overflow-y-auto px-4 py-2 space-y-1 no-scrollbar flex-1">
            <button
              onClick={() => {
                setShowDetailActionsSheet(false);
                startEditTransaction(trx);
              }}
              className="w-full text-left py-3.5 px-3 hover:bg-zinc-900/65 rounded-xl text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-3 transition cursor-pointer"
            >
              <Pencil className="w-4 h-4 text-sky-450" />
              <span>📝 Ubah Transaksi</span>
            </button>

            <button
              onClick={() => {
                const link = `https://laundrydam.com/track/${trx.id}`;
                navigator.clipboard.writeText(link);
                setShowDetailActionsSheet(false);
                showToast("Link Tracking Berhasil Disalin!");
              }}
              className="w-full text-left py-3.5 px-3 hover:bg-zinc-900/65 rounded-xl text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-3 transition cursor-pointer"
            >
              <Copy className="w-4 h-4 text-emerald-400" />
              <span>📋 Salin Link untuk Tracking</span>
            </button>

            <button
              onClick={() => {
                const text = `Nota Laundry ${trx.customerName} (${trx.id.replace(/-/g, "/")}): Total ${formatIDR(trx.totalHarga)}`;
                navigator.clipboard.writeText(text);
                setShowDetailActionsSheet(false);
                showToast("Nota Berhasil Dibagikan!");
              }}
              className="w-full text-left py-3.5 px-3 hover:bg-zinc-900/65 rounded-xl text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-3 transition cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-indigo-400" />
              <span>🔗 Bagikan Nota</span>
            </button>

            <button
              onClick={() => {
                const messageText = generateWhatsAppReceiptText(trx);
                const url = `https://wa.me/${trx.customerPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(messageText)}`;
                window.open(url, "_blank");
                setShowDetailActionsSheet(false);
              }}
              className="w-full text-left py-3.5 px-3 hover:bg-zinc-900/65 rounded-xl text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-3 transition cursor-pointer"
            >
              <Smartphone className="w-4 h-4 text-emerald-500" />
              <span>💸 Kirim Nota via WhatsApp</span>
            </button>

            <button
              onClick={() => {
                const messageText = generateWhatsAppReceiptText(trx);
                navigator.clipboard.writeText(messageText);
                setShowDetailActionsSheet(false);
                showToast("Nota Teks Berhasil Disalin!");
              }}
              className="w-full text-left py-3.5 px-3 hover:bg-zinc-900/65 rounded-xl text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-3 transition cursor-pointer"
            >
              <FileText className="w-4 h-4 text-yellow-500" />
              <span>✈️ Kirim Nota Teks</span>
            </button>

            <button
              onClick={() => {
                const billDesc = trx.statusBayar === "DP" && trx.dpAmount
                  ? `DP ${formatIDR(trx.dpAmount)}, Sisa Tagihan ${formatIDR(trx.totalHarga - trx.dpAmount)}`
                  : trx.statusBayar;
                const billText = `Halo Kak ${trx.customerName}, berikut tagihan laundry Anda sebesar ${formatIDR(trx.totalHarga)} (${billDesc}). Hubungi kami untuk pembayaran. Terima kasih!`;
                navigator.clipboard.writeText(billText);
                setShowDetailActionsSheet(false);
                showToast("Pesan Tagihan Berhasil Disalin!");
              }}
              className="w-full text-left py-3.5 px-3 hover:bg-zinc-900/65 rounded-xl text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-3 transition cursor-pointer"
            >
              <DollarSign className="w-4 h-4 text-rose-400" />
              <span>💵 Kirim Pesan Tagihan</span>
            </button>

            {isOwner && (
              <>
                <button
                  onClick={async () => {
                    try {
                      await onUpdateTransaction(trx.id, { status: "Batal" });
                      setSelectedDetailTrx({ ...trx, status: "Batal" });
                      setShowDetailActionsSheet(false);
                      showToast("Transaksi berhasil dibatalkan!");
                    } catch (err) {
                      alert("Gagal membatalkan transaksi: " + String(err));
                    }
                  }}
                  className="w-full text-left py-3.5 px-3 hover:bg-zinc-900/65 rounded-xl text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-3 transition border-t border-[#1C1C1E] cursor-pointer"
                >
                  <DollarSign className="w-4 h-4 text-amber-500 rotate-180" />
                  <span>❌ Batalkan Transaksi</span>
                </button>

                <button
                  onClick={() => {
                    setShowDetailActionsSheet(false);
                    triggerConfirm(
                      "Hapus Transaksi",
                      "Apakah Anda yakin ingin menghapus transaksi ini? Tindakan ini bersifat permanen.",
                      async () => {
                        await onDeleteTransaction(trx.id);
                        setSelectedDetailTrx(null);
                      },
                      true
                    );
                  }}
                  className="w-full text-left py-3.5 px-3 hover:bg-red-950/20 rounded-xl text-xs font-bold text-rose-500 flex items-center gap-3 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                  <span>🗑️ Hapus Transaksi</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderEditModal = () => {
    // Parse notes to display correctly
    let rawNotes = editNotes || "";
    let cleanNotes = rawNotes
      .replace(/\(Biaya Tambahan:\s*([^)]*)\)/g, "")
      .replace(/\(Diskon:\s*Rp\s*[\d,.]*\)/g, "")
      .replace(/\(Pembulatan:\s*Rp\s*[\d,.]*\)/g, "")
      .replace(/\[Kasir:\s*([^\]]*)]/g, "")
      .trim();

    return (
      <div className="absolute inset-0 bg-[#0A0A0B] z-55 flex flex-col font-sans text-left overflow-hidden">
        {/* Edit Modal Header */}
        <div className="p-4 bg-[#121214] border-b border-zinc-900 flex items-center justify-between shrink-0">
          <div className="flex items-center">
            <button 
              type="button"
              onClick={() => setIsEditingTrx(false)}
              className="text-white hover:text-[#0ea5e9] mr-4 cursor-pointer"
            >
              <ChevronRight className="w-6 h-6 rotate-180" />
            </button>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Ubah Transaksi
            </h2>
          </div>

          <button
            onClick={saveEditedTransaction}
            className="px-4 py-1.5 bg-emerald-500 text-black text-[10.5px] font-black uppercase tracking-wider rounded-none active:scale-95 transition cursor-pointer"
          >
            Simpan
          </button>
        </div>

        {/* Scrollable Fields */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-12">
          
          {/* Section: Pelanggan */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-3.5 text-xs text-left">
            <h4 className="font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Pelanggan</h4>
            
            <div className="space-y-3">
              <div>
                <label className="text-zinc-500 font-bold uppercase text-[9px] tracking-wide block mb-1">Nama</label>
                <input
                  type="text"
                  value={editCustName}
                  onChange={(e) => setEditCustName(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3 text-xs text-white"
                  placeholder="Nama Pelanggan"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-bold uppercase text-[9px] tracking-wide block mb-1">No HP / Handphone</label>
                <input
                  type="text"
                  value={editCustPhone}
                  onChange={(e) => setEditCustPhone(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3 text-xs text-white font-mono"
                  placeholder="08xxxxxxxxxx"
                />
              </div>
            </div>
          </div>

          {/* Section: Waktu */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-3.5 text-xs text-left">
            <h4 className="font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Waktu</h4>
            
            <div className="space-y-3">
              <div>
                <label className="text-zinc-500 font-bold uppercase text-[9px] tracking-wide block mb-1">Waktu Masuk</label>
                <input
                  type="datetime-local"
                  value={parseToDatetimeLocal(editWaktuMasuk)}
                  onChange={(e) => setEditWaktuMasuk(parseFromDatetimeLocal(e.target.value))}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3 text-xs text-white font-mono cursor-pointer"
                />
              </div>

              <div>
                <label className="text-zinc-500 font-bold uppercase text-[9px] tracking-wide block mb-1">Estimasi Selesai</label>
                <input
                  type="datetime-local"
                  value={parseToDatetimeLocal(editWaktuSelesai)}
                  onChange={(e) => setEditWaktuSelesai(parseFromDatetimeLocal(e.target.value))}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3 text-xs text-white font-mono cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Section: Layanan */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-3.5 text-xs text-left">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><Shirt className="w-3.5 h-3.5" /> Layanan Laundry</h4>
              <button
                type="button"
                onClick={() => setIsEditSelectingServSheet(true)}
                className="text-sky-450 hover:text-sky-350 px-2 py-0.5 border border-sky-950 bg-sky-950/20 uppercase text-[10px] font-black cursor-pointer"
              >
                + Layanan
              </button>
            </div>

            <div className="space-y-3 pt-1">
              {editSelectedLayanan.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center justify-between border-b border-zinc-900 pb-2.5 last:border-b-0 last:pb-0 gap-3 text-left">
                  <div className="flex-1 space-y-1.5 text-left">
                    <span className="block text-white font-bold text-xs">{item.nama}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={item.berat}
                        onChange={(e) => {
                          const updated = [...editSelectedLayanan];
                          updated[idx].berat = e.target.value;
                          setEditSelectedLayanan(updated);
                        }}
                        className="w-14 bg-[#1C1C1E] border border-zinc-800 rounded px-1.5 py-0.5 text-center text-white font-black text-xs font-mono"
                        placeholder="Qty"
                      />
                      <span className="text-zinc-[450] font-mono text-[10px]">{getServiceUnitText(item.nama, item.tipe)} x {formatIDR(item.harga)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditSelectedLayanan(editSelectedLayanan.filter((_, i) => i !== idx));
                    }}
                    className="text-rose-500 hover:text-rose-400 cursor-pointer p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Biaya Tambahan */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-3.5 text-xs text-left">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Biaya Tambahan</h4>
              <button
                type="button"
                onClick={() => {
                  const feeName = prompt("Masukkan nama biaya tambahan (contoh: Delivery):", "Antar Jemput");
                  if (!feeName) return;
                  const feeVal = prompt("Masukkan biaya tambahan (Rupiah):", "5000");
                  if (!feeVal) return;
                  const amt = parseInt(feeVal.replace(/[^0-9]/g, ""), 10) || 0;
                  setEditBiayaTambahan([
                    ...editBiayaTambahan,
                    {
                      id: "B-EDIT-ADD-" + Math.random().toString().slice(-4),
                      nama: feeName,
                      jumlah: amt
                    }
                  ]);
                }}
                className="text-sky-450 hover:text-sky-350 px-2 py-0.5 border border-sky-950 bg-sky-950/20 uppercase text-[10px] font-black cursor-pointer"
              >
                + Tambah
              </button>
            </div>

            <div className="space-y-2 font-mono">
              {editBiayaTambahan.map((bt, idx) => (
                <div key={bt.id || idx} className="flex justify-between items-center text-zinc-200">
                  <span>{bt.nama}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{formatIDR(bt.jumlah)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditBiayaTambahan(editBiayaTambahan.filter((_, i) => i !== idx));
                      }}
                      className="text-rose-500 hover:text-rose-400 cursor-pointer text-sm font-bold px-1"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Diskon */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-3.5 text-xs text-left">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">🎁 Diskon Nominal</h4>
              <button
                type="button"
                onClick={() => setEditShowDiskonInput(!editShowDiskonInput)}
                className="text-xs text-sky-450 font-bold cursor-pointer"
              >
                {editShowDiskonInput ? "Sembunyikan" : "Tampilkan"}
              </button>
            </div>

            {editShowDiskonInput && (
              <input
                type="number"
                value={editDiskonNominal || ""}
                onChange={(e) => setEditDiskonNominal(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3 text-xs text-white font-mono animate-fade-in"
                placeholder="Jumlah Diskon (Rp)"
              />
            )}
          </div>

          {/* Section: Pewangi, Kasir, Status */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-4 text-xs text-left">
            <h4 className="font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">⚙️ Pengaturan Lainnya</h4>

            <div className="space-y-3">
              <div>
                <label className="text-zinc-500 font-bold uppercase text-[9px] tracking-wide block mb-1">Kasir</label>
                <input
                  type="text"
                  value={editCashier}
                  onChange={(e) => setEditCashier(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4.5 py-3 text-xs text-white"
                  placeholder="Karyawan / Mba Dwi"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-zinc-500 font-bold uppercase text-[9px] tracking-wide block">Pewangi / Parfum</label>
                  <button
                    type="button"
                    onClick={() => {
                      setInlineContext("edit");
                      setShowInlineNewParfumForm(true);
                    }}
                    className="text-[9px] text-sky-400 hover:text-sky-300 font-extrabold uppercase tracking-tight flex items-center gap-0.5"
                  >
                    <span>+ Tambah Parfum</span>
                  </button>
                </div>
                <select
                  value={editParfum}
                  onChange={(e) => setEditParfum(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-3 py-3 text-xs text-white focus:outline-none"
                >
                  {getPerfumeOptions(editParfum).map((pf) => (
                    <option key={pf} value={pf} className="bg-[#121214] text-white">{pf}</option>
                  ))}
                </select>
                {showInlineNewParfumForm && inlineContext === "edit" && (
                  <div className="mt-2 p-2.5 bg-zinc-900 border border-[#27272A] rounded-xl space-y-2">
                    <p className="text-[9px] text-zinc-400 font-black uppercase tracking-wider">Tambah Parfum Baru</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nama parfum (contoh: Sakura)"
                        value={inlineNewParfumName}
                        onChange={(e) => setInlineNewParfumName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateInlineParfum("edit");
                          }
                        }}
                        className="flex-1 text-xs font-semibold bg-[#1C1C1E] border border-[#27272A] rounded-lg px-2.5 py-1.5 text-white focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateInlineParfum("edit")}
                        className="px-3 py-1.5 bg-emerald-500 text-black font-extrabold text-[10px] rounded hover:bg-emerald-450 transition active:scale-95"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowInlineNewParfumForm(false);
                          setInlineNewParfumName("");
                        }}
                        className="px-2 py-1.5 bg-zinc-800 text-zinc-400 text-[10px] rounded hover:bg-zinc-700"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-zinc-500 font-bold uppercase text-[9px] tracking-wide block mb-1">Status Transaksi</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-3 py-3 text-xs text-white focus:outline-none"
                >
                  {["Antrian", "Proses", "Selesai", "Diambil", ...((isOwner || editStatus === "Batal") ? ["Batal"] : [])].map((s) => (
                    <option key={s} value={s} className="bg-[#121214] text-white">{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-500 font-bold uppercase text-[9px] tracking-wide block mb-1">Status Pembayaran</label>
                <select
                  value={editStatusBayar}
                  onChange={(e) => setEditStatusBayar(e.target.value as any)}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-3 py-3 text-xs text-white focus:outline-none"
                >
                  <option value="Belum Lunas" className="bg-[#121214]">Belum Lunas</option>
                  <option value="Lunas" className="bg-[#121214]">Lunas</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-500 font-bold uppercase text-[9px] tracking-wide block mb-1">Metode Pembayaran</label>
                <select
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value as any)}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-3 py-3 text-xs text-white focus:outline-none"
                >
                  <option value="Tunai" className="bg-[#121214]">Tunai</option>
                  <option value="QRIS" className="bg-[#121214]">QRIS</option>
                  <option value="Transfer" className="bg-[#121214]">Transfer</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-500 font-bold uppercase text-[9px] tracking-wide block mb-1">Catatan</label>
                <textarea
                  value={cleanNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3 text-xs text-zinc-150 focus:outline-none font-semibold"
                  placeholder="Ketik catatan tambahan..."
                />
              </div>
            </div>
          </div>

          {/* Section: Pembulatan */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-3.5 text-xs text-left">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">⚖️ Pembulatan Kelipatan</h4>
              <button
                type="button"
                onClick={() => setEditIsPembulatanActive(!editIsPembulatanActive)}
                className={`px-3 py-1 font-bold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer ${
                  editIsPembulatanActive ? "bg-emerald-950/45 border border-emerald-900/50 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {editIsPembulatanActive ? "Aktif" : "Nonaktif"}
              </button>
            </div>

            {editIsPembulatanActive && (
              <div className="flex gap-2">
                {["500", "1000"].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => setEditPembulatanTipe(step as any)}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                      editPembulatanTipe === step ? "border-emerald-500 text-emerald-400 bg-emerald-950/20" : "border-zinc-800 text-zinc-400 bg-zinc-900/40"
                    }`}
                  >
                    Kelipatan {step}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Display Bill Calculation */}
          <div className="bg-[#1C1C1E]/50 border border-zinc-900 p-4 rounded-xl space-y-2.5 text-xs font-mono text-left">
            <div className="flex justify-between items-center text-zinc-500">
              <span>Subtotal Layanan</span>
              <span>{formatIDR(editServicesSubtotal)}</span>
            </div>

            {editBiayaTambahan.length > 0 && (
              <div className="flex justify-between items-center text-zinc-500">
                <span>Subtotal Tambahan</span>
                <span>{formatIDR(editExtraFeesTotal)}</span>
              </div>
            )}

            {editDiskonNominal > 0 && editShowDiskonInput && (
              <div className="flex justify-between items-center text-rose-500">
                <span>Diskon</span>
                <span>-{formatIDR(editDiskonNominal)}</span>
              </div>
            )}

            {editIsPembulatanActive && editNominalPembulatan > 0 && (
              <div className="flex justify-between items-center text-zinc-500">
                <span>Pembulatan</span>
                <span>+{formatIDR(editNominalPembulatan)}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-sky-450 font-black text-sm border-t border-zinc-950 pt-2 font-sans uppercase">
              <span>Total Estimasi Baru</span>
              <span>{formatIDR(editGrandTotalResult)}</span>
            </div>
          </div>

        </div>

        {/* DIALOG E: Choose service sheet for edit flow */}
        {isEditSelectingServSheet && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-xs z-60 flex flex-col justify-end p-0 font-sans">
            <div 
              className="absolute inset-0" 
              onClick={() => setIsEditSelectingServSheet(false)}
            />

            <div className="w-full max-w-[420px] mx-auto bg-[#121214] border-t border-[#27272A] rounded-t-2xl shadow-2xl relative z-10 flex flex-col max-h-[85vh] overflow-hidden text-left pb-6">
              
              <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto my-3 shrink-0" />

              <div className="px-5 pb-3 flex items-center justify-between border-b border-zinc-900/60 shrink-0">
                <h4 className="text-base font-bold text-white text-center w-full relative">
                  Pilih Layanan
                  <button 
                    type="button"
                    onClick={() => setIsEditSelectingServSheet(false)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </h4>
              </div>

              {/* Search input */}
              <div className="p-4 shrink-0">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Cari jenis layanan laundry..."
                    value={editServSearchQuery}
                    onChange={(e) => setEditServSearchQuery(e.target.value)}
                    className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3 pl-11 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-sky-500 font-medium font-semibold"
                  />
                  <Search className="w-4 h-4 text-zinc-650 absolute left-4 top-3.5" />
                </div>
              </div>

              {/* Services items */}
              <div className="flex-1 overflow-y-auto px-5 divide-y divide-zinc-900/60 no-scrollbar">
                {(() => {
                  const results = services.filter(s => 
                    s.nama.toLowerCase().includes(editServSearchQuery.toLowerCase()) ||
                    s.kategori?.toLowerCase().includes(editServSearchQuery.toLowerCase())
                  );

                  if (results.length === 0) {
                    return (
                      <div className="py-12 text-center text-zinc-500 font-semibold text-xs uppercase tracking-wider">
                        Tidak ada layanan ditemukan
                      </div>
                    );
                  }

                  return results.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        // Push into editSelectedLayanan
                        const newlyAdded = {
                          id: "L-EDIT-ADD-" + Math.random().toString().slice(-4),
                          serviceId: s.id,
                          nama: s.nama,
                          berat: s.minimalKuantitas || 1,
                          harga: s.harga,
                          tipe: s.tipe
                        };
                        setEditSelectedLayanan(prev => [...prev, newlyAdded]);
                        setIsEditSelectingServSheet(false);
                      }}
                      className="w-full text-left py-4 px-2 hover:bg-zinc-900/40 text-xs font-semibold text-zinc-300 hover:text-white flex justify-between items-center transition cursor-pointer"
                    >
                      <div>
                        <span className="block text-white font-semibold">{s.nama}</span>
                        <span className="text-zinc-[450] font-medium text-[10px] block mt-0.5">
                          {formatIDR(s.harga)} / {getServiceUnitText(s.nama, s.tipe)} • {s.kategori || "Reguler"} ({s.durasiJam} Jam)
                        </span>
                      </div>
                    </button>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

      </div>
    );
  };

  const renderDetailView = (trx: LaundryTransaction) => {
    // Reconstruct list of services
    const layanans = parseLayananString(trx.layananNama, trx.layananId, trx.berat, trx.totalHarga);
    
    // Parse notes to display correctly
    let rawNotes = trx.notes || "";
    let cleanNotes = rawNotes
      .replace(/\(Biaya Tambahan:\s*([^)]*)\)/g, "")
      .replace(/\(Diskon:\s*Rp\s*[\d,.]*\)/g, "")
      .replace(/\(Pembulatan:\s*Rp\s*[\d,.]*\)/g, "")
      .replace(/\[Kasir:\s*([^\]]*)]/g, "")
      .trim();

    // Extract cashier
    const cashierMatch = rawNotes.match(/\[Kasir:\s*([^\]]+)\]/);
    const cashierName = cashierMatch ? cashierMatch[1] : "Mba Dwi";

    // Extract discount
    let diskonNominalExt = 0;
    const diskMatch = rawNotes.match(/\(Diskon:\s*Rp\s*([\d,.]+)\)/);
    if (diskMatch) {
      diskonNominalExt = parseInt(diskMatch[1].replace(/[,.]/g, ""), 10) || 0;
    }

    // Extract pembulatan
    let pembulatanNominalExt = 0;
    const pembMatch = rawNotes.match(/\(Pembulatan:\s*Rp\s*([\d,.]+)\)/);
    if (pembMatch) {
      pembulatanNominalExt = parseInt(pembMatch[1].replace(/[,.]/g, ""), 10) || 0;
    }

    // Extract extra fees
    const extraFeesList: Array<{nama: string, jumlah: number}> = [];
    const btMatch = rawNotes.match(/\(Biaya Tambahan:\s*([^)]+)\)/);
    if (btMatch) {
      const parts = btMatch[1].split(", ");
      parts.forEach(p => {
        const itemParts = p.split(": Rp ");
        if (itemParts.length >= 2) {
          extraFeesList.push({
            nama: itemParts[0].trim(),
            jumlah: parseInt(itemParts[1].replace(/[,.]/g, ""), 10) || 0
          });
        }
      });
    }

    // Recompute services subtotal
    const servicesSub = layanans.reduce((sum, item) => {
      const bVal = typeof item.berat === "string" ? parseFloat(item.berat.replace(",", ".")) || 0 : item.berat;
      return sum + (item.harga * bVal);
    }, 0);

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans relative">
        {/* Header matching Screenshot 2 */}
        <div className="p-4 bg-[#121214] border-b border-zinc-900 flex items-center shrink-0">
          <button 
            type="button"
            onClick={() => setSelectedDetailTrx(null)}
            className="text-white hover:text-[#0ea5e9] mr-4 cursor-pointer"
          >
            <ChevronRight className="w-6 h-6 rotate-180" />
          </button>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Detail Transaksi
          </h2>
        </div>

        {/* Scrollable Contents representing Screenshot 2 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
          
          {/* SECTION A: INFO TRANSAKSI */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-3.5 shadow-sm text-left animate-fade-in">
            <h3 className="text-xs font-bold text-zinc-400 border-b border-zinc-900 pb-2 flex items-center gap-1.5 uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5 text-sky-450" /> Info Transaksi
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium font-mono">Waktu Transaksi</span>
                <span className="text-zinc-250 font-bold font-mono">{formatTanggal(trx.tanggalMasuk)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium font-mono">No. Transaksi</span>
                <span className="text-sky-450 font-black font-mono tracking-wider">
                  {trx.id.replace(/-/g, "/")}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium font-mono">Status Transaksi</span>
                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                  trx.status === "Antrian" ? "bg-amber-950/40 text-amber-500 border border-amber-900/40" :
                  trx.status === "Proses" ? "bg-indigo-950/45 text-indigo-400 border border-indigo-900/40" :
                  trx.status === "Selesai" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-950/40" :
                  trx.status === "Diambil" ? "bg-zinc-800 text-zinc-400 border border-zinc-700" :
                  "bg-red-950/40 text-rose-500 border border-red-900/40"
                }`}>
                  {trx.status}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium font-mono">Kasir</span>
                <span className="text-zinc-300 font-bold font-mono">{cashierName}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium font-mono">Parfum / Pewangi</span>
                <span className="text-zinc-300 font-bold font-mono">{trx.parfum || "Dianamist"}</span>
              </div>

              <div className="pt-2">
                <div className="bg-sky-950/45 border border-sky-900 text-sky-450 rounded-xl px-4 py-3 text-center flex justify-between items-center">
                  <span className="text-[10.5px] font-bold font-mono uppercase tracking-wide">Estimasi Selesai</span>
                  <span className="text-[11.5px] font-black font-mono text-zinc-150">{formatTanggal(trx.estimasiSelesai)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION B: INFO PELANGGAN */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-3 shadow-sm text-left">
            <h3 className="text-xs font-bold text-zinc-400 border-b border-zinc-900 pb-2 flex items-center gap-1.5 uppercase tracking-wider">
              <User className="w-3.5 h-3.5 text-sky-450" /> Info Pelanggan
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium font-mono">Nama Pelanggan</span>
                <span 
                  onClick={() => {
                    const activeCust = customers.find(c => c.telepon === trx.customerPhone || c.nama === trx.customerName);
                    if (activeCust && onViewCustomerProfile) {
                      onViewCustomerProfile(activeCust);
                    } else if (activeCust) {
                      alert(`Detail Pelanggan:\nNama: ${activeCust.nama}\nNo HP: ${activeCust.telepon}\nAlamat: ${activeCust.alamat || "-"}\nSaldo Deposit: Rp ${activeCust.saldoDeposit?.toLocaleString("id-ID") || 0}`);
                    } else {
                      alert(`Pelanggan "${trx.customerName}" tidak ditemukan di database.`);
                    }
                  }}
                  className="text-sky-450 hover:text-sky-350 hover:underline font-black flex items-center gap-1 cursor-pointer transition-all duration-150"
                  title="Lihat profil detail pelanggan & saldo deposit"
                >
                  {trx.customerName} <ChevronRight className="w-4 h-4 translate-y-px" />
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium font-mono">No. Handphone</span>
                <a 
                  href={`https://wa.me/${trx.customerPhone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-450 hover:underline font-bold font-mono flex items-center gap-1"
                >
                  📞 {trx.customerPhone}
                </a>
              </div>

              {(() => {
                const activeCust = customers.find(c => c.telepon === trx.customerPhone || c.nama === trx.customerName);
                if (activeCust && activeCust.saldoDeposit !== undefined) {
                  return (
                    <div className="flex justify-between items-center border-t border-zinc-900 pt-2.5">
                      <span className="text-zinc-500 font-medium font-mono">Total Saldo Deposit</span>
                      <span className="text-emerald-400 font-extrabold font-mono">
                        Rp {activeCust.saldoDeposit.toLocaleString("id-ID")}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* SECTION C: LAYANAN LAUNDRY */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-4 shadow-sm text-left">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
              <h3 className="text-xs font-bold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Shirt className="w-3.5 h-3.5 text-sky-450" /> Layanan Laundry
              </h3>
              <button
                onClick={() => startEditTransaction(trx)}
                className="text-sky-450 hover:text-sky-350 text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3 stroke-[3]" /> Tambah
              </button>
            </div>

            <div className="space-y-4">
              {layanans.map((item) => {
                const isEditingInline = editingServiceIdInline === item.id;
                const weightVal = typeof item.berat === "string" ? parseFloat(item.berat.replace(",", ".")) || 0 : item.berat;
                
                return (
                  <div key={item.id} className="space-y-2.5 border-b border-zinc-900/50 pb-3 last:border-b-0 last:pb-0 font-sans">
                    <div className="flex justify-between items-start gap-4">
                      <div className="text-left flex-1">
                        {isEditingInline ? (
                          <div className="flex flex-col gap-2 mt-1 bg-zinc-950 p-3 rounded-lg border border-zinc-850 w-full">
                            <div>
                              <label className="text-[9px] text-zinc-550 font-bold uppercase block mb-1">Pilih Layanan</label>
                              <select
                                value={inlineEditServiceId}
                                onChange={(e) => setInlineEditServiceId(e.target.value)}
                                className="w-full bg-[#1C1C1E] border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white font-bold cursor-pointer"
                              >
                                {services.map(s => (
                                  <option key={s.id} value={s.id}>
                                    {s.nama} ({formatIDR(s.harga)} / {getServiceUnitText(s.nama, s.tipe)})
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            <div>
                              <label className="text-[9px] text-zinc-550 font-bold uppercase block mb-1">Kuantitas</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={inlineEditWeightValue}
                                  onChange={(e) => setInlineEditWeightValue(e.target.value)}
                                  className="flex-1 bg-[#1C1C1E] border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white font-bold text-center font-mono"
                                  placeholder="Kuantitas"
                                  autoFocus
                                />
                                <span className="text-zinc-[450] font-bold font-mono text-xs">
                                  {(() => {
                                    const s = services.find(x => x.id === inlineEditServiceId);
                                    return getServiceUnitText(s?.nama, s?.tipe);
                                  })()}
                                </span>
                              </div>
                            </div>

                            <div className="flex justify-end gap-1.5 mt-1">
                              <button
                                type="button"
                                onClick={() => setEditingServiceIdInline(null)}
                                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold rounded-lg cursor-pointer transition active:scale-95"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const parsedVal = parseFloat(inlineEditWeightValue.replace(",", ".")) || 0;
                                  if (parsedVal <= 0) {
                                    alert("Kuantitas wajib numerik positif");
                                    return;
                                  }
                                  handleUpdateServiceInline(item.id, inlineEditServiceId, parsedVal);
                                }}
                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black rounded-lg cursor-pointer transition active:scale-95 animate-pulse"
                              >
                                Simpan
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span className="text-white font-black text-xs block leading-relaxed">{item.nama}</span>
                            <span className="text-zinc-[450] font-bold font-mono text-[11px] block mt-0.5">
                              {weightVal} {getServiceUnitText(item.nama, item.tipe)} x {formatIDR(item.harga)}
                            </span>
                          </>
                        )}
                      </div>
                      
                      {!isEditingInline && (
                        <div className="flex flex-col items-end gap-2.5 shrink-0">
                          <span className="text-white font-black text-xs font-mono">
                            {formatIDR(weightVal * item.harga)}
                          </span>
                          
                          {/* Green outline edit pencil & Red outline trash delete buttons styled precisely to Screenshot */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingServiceIdInline(item.id);
                                setInlineEditWeightValue(String(item.berat));
                                setInlineEditServiceId(item.serviceId);
                              }}
                              className="w-[38px] h-[38px] border border-[#0B3A31]/90 bg-emerald-950/20 hover:bg-emerald-900/20 text-emerald-400 rounded-xl flex items-center justify-center transition active:scale-90 cursor-pointer"
                              title="Edit Layanan & Jumlah"
                            >
                              <Pencil className="w-[15px] h-[15px] stroke-[2.5]" />
                            </button>
                            
                            <button
                              onClick={() => handleDeleteServiceInline(item.id)}
                              className="w-[38px] h-[38px] border border-rose-950/90 bg-rose-950/20 hover:bg-rose-900/20 text-rose-500 rounded-xl flex items-center justify-center transition active:scale-90 cursor-pointer"
                              title="Hapus Layanan"
                            >
                              <Trash2 className="w-[15px] h-[15px] stroke-[2.5]" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Interactive Stage Progress indicators aligned to Screenshot 2 */}
                    <div className="flex justify-between items-center pt-3.5 border-t border-zinc-900/40 mt-1">
                      <div className="flex gap-2.5">
                        <button
                          onClick={async () => {
                            try {
                              await onUpdateTransaction(trx.id, { status: "Antrian" });
                              setSelectedDetailTrx({ ...trx, status: "Antrian" });
                              showToast("Status diubah ke Antrian!");
                            } catch (err) {
                              alert("Gagal merubah status: " + String(err));
                            }
                          }}
                          className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center border transition-all active:scale-90 cursor-pointer ${
                            trx.status === "Antrian"
                              ? "bg-sky-500/15 border-sky-500/50 text-sky-400"
                              : "bg-zinc-900/90 border-[#27272A] text-zinc-500 hover:text-zinc-400 hover:border-zinc-700"
                          }`}
                          title="Tandai Antrian"
                        >
                          <FileText className="w-4 h-4" />
                        </button>

                        <button
                          onClick={async () => {
                            try {
                              await onUpdateTransaction(trx.id, { status: "Proses" });
                              setSelectedDetailTrx({ ...trx, status: "Proses" });
                              showToast("Status diubah ke Proses!");
                            } catch (err) {
                              alert("Gagal merubah status: " + String(err));
                            }
                          }}
                          className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center border transition-all active:scale-90 cursor-pointer ${
                            trx.status === "Proses"
                              ? "bg-amber-500/15 border-amber-500/50 text-amber-500 font-bold"
                              : "bg-zinc-900/90 border-[#27272A] text-zinc-500 hover:text-zinc-400 hover:border-zinc-700"
                          }`}
                          title="Tandai Cuci & Proses"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={async () => {
                            try {
                              await onUpdateTransaction(trx.id, { status: "Selesai" });
                              setSelectedDetailTrx({ ...trx, status: "Selesai" });
                              showToast("Status diubah ke Selesai!");
                            } catch (err) {
                              alert("Gagal merubah status: " + String(err));
                            }
                          }}
                          className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center border transition-all active:scale-90 cursor-pointer ${
                            trx.status === "Selesai"
                              ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400"
                              : "bg-zinc-900/90 border-[#27272A] text-zinc-500 hover:text-zinc-400 hover:border-zinc-700"
                          }`}
                          title="Tandai Selesai Laundry"
                        >
                          <Shirt className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            sendWhatsAppReceipt(trx);
                            showToast("Membuka WhatsApp...");
                          }}
                          className="w-[34px] h-[34px] rounded-lg flex items-center justify-center border bg-zinc-900/90 border-[#27272A] text-zinc-500 hover:text-zinc-350 hover:border-zinc-700 transition-all active:scale-90 cursor-pointer"
                          title="Kirim Nota / Chat WA"
                        >
                          <Smartphone className="w-4 h-4 text-sky-400" />
                        </button>

                        <button
                          onClick={async () => {
                            try {
                              await onUpdateTransaction(trx.id, { status: "Diambil" });
                              setSelectedDetailTrx({ ...trx, status: "Diambil" });
                              showToast("Status diubah ke Diambil!");
                            } catch (err) {
                              alert("Gagal merubah status: " + String(err));
                            }
                          }}
                          className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center border transition-all active:scale-90 cursor-pointer ${
                            trx.status === "Diambil"
                              ? "bg-teal-500/15 border-teal-500/50 text-teal-400 animate-pulse"
                              : "bg-zinc-900/90 border-[#27272A] text-zinc-500 hover:text-zinc-400 hover:border-zinc-700"
                          }`}
                          title="Tandai Sudah Diambil"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Unified responsive status actions button aligned to mockup */}
                      <button
                        onClick={async () => {
                          const next = trx.status === "Antrian" ? "Proses" : trx.status === "Proses" ? "Selesai" : trx.status === "Selesai" ? "Diambil" : trx.status;
                          if (next !== trx.status) {
                            try {
                              await onUpdateTransaction(trx.id, { status: next });
                              setSelectedDetailTrx({ ...trx, status: next });
                              showToast(`Status diperbarui ke ${next}!`);
                            } catch (err) {
                              alert("Gagal merubah status: " + String(err));
                            }
                          }
                        }}
                        className={`px-4.5 py-2.5 font-sans font-black text-xs uppercase rounded-xl tracking-wider cursor-pointer active:scale-95 transition-all min-w-[100px] text-center shadow-lg ${
                          trx.status === "Antrian" ? "bg-amber-500 hover:bg-amber-400 text-black animate-pulse" :
                          trx.status === "Proses" ? "bg-[#10b981] hover:bg-emerald-400 text-black font-black" :
                          trx.status === "Selesai" ? "bg-[#0ea5e9] hover:bg-sky-400 text-white font-black" :
                          "bg-zinc-800 text-zinc-550 border border-zinc-800 cursor-not-allowed"
                        }`}
                      >
                        {trx.status === "Antrian" ? "Proses" :
                         trx.status === "Proses" ? "Selesai" :
                         trx.status === "Selesai" ? "Diambil" : "Selesai"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION D: BIAYA TAMBAHAN */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-3 shadow-sm text-left">
            <div className="flex justify-between items-center border-b border-zinc-900/80 pb-2">
              <h3 className="text-xs font-bold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
                <DollarSign className="w-3.5 h-3.5 text-sky-450" /> Biaya Tambahan
              </h3>
              <button
                onClick={() => startEditTransaction(trx)}
                className="text-sky-450 hover:text-sky-350 text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3 stroke-[3]" /> Tambah
              </button>
            </div>

            {extraFeesList.length === 0 ? (
              <p className="text-[11px] text-zinc-550 font-medium py-1">Tidak ada biaya tambahan</p>
            ) : (
              <div className="space-y-2 text-xs font-mono text-zinc-350">
                {extraFeesList.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span>{item.nama}</span>
                    <span className="font-bold">{formatIDR(item.jumlah)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION E: INFO PEMBAYARAN */}
          <div className="bg-[#121214] border border-[#27272A] rounded-xl p-4 space-y-3.5 shadow-sm text-left">
            <h3 className="text-xs font-bold text-zinc-400 border-b border-zinc-900 pb-2 flex items-center gap-1.5 uppercase tracking-wider">
              <CreditCard className="w-3.5 h-3.5 text-sky-450" /> Info Pembayaran
            </h3>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between items-center text-zinc-500">
                <span>Subtotal Layanan</span>
                <span>{formatIDR(servicesSub)}</span>
              </div>

              {extraFeesList.length > 0 && (
                <div className="flex justify-between items-center text-zinc-500">
                  <span>Subtotal Tambahan</span>
                  <span>{formatIDR(extraFeesList.reduce((sum, item) => sum + item.jumlah, 0))}</span>
                </div>
              )}

              {diskonNominalExt > 0 && (
                <div className="flex justify-between items-center text-[#ff3366]">
                  <span>Diskon</span>
                  <span>-{formatIDR(diskonNominalExt)}</span>
                </div>
              )}

              {pembulatanNominalExt > 0 && (
                <div className="flex justify-between items-center text-zinc-500">
                  <span>Pembulatan</span>
                  <span>{formatIDR(pembulatanNominalExt)}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-white font-extrabold border-t border-zinc-900/60 pt-2 text-[12.5px]">
                <span>Total Transaksi</span>
                <span>{formatIDR(trx.totalHarga)}</span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-zinc-[450] font-bold">Status Pembayaran</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                  trx.statusBayar === "Lunas"
                    ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/40"
                    : trx.statusBayar === "DP"
                    ? "bg-amber-955/40 text-amber-500 border border-amber-900/40"
                    : "bg-red-955/40 text-rose-500 border border-red-900/40"
                }`}>
                  {trx.statusBayar}
                </span>
              </div>

              {trx.statusBayar === "DP" && trx.dpAmount !== undefined && (
                <>
                  <div className="flex justify-between items-center py-1 font-sans">
                    <span className="text-zinc-[450] font-bold">DP Terbayar</span>
                    <span className="text-xs font-black text-emerald-400 font-mono">
                      {formatIDR(trx.dpAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-zinc-900/40 pb-1.5 font-sans">
                    <span className="text-zinc-[450] font-bold">Sisa Tagihan</span>
                    <span className="text-xs font-black text-rose-500 font-mono">
                      {formatIDR(Math.max(0, trx.totalHarga - trx.dpAmount))}
                    </span>
                  </div>
                </>
              )}

              {trx.pembayaranMetode && (
                <div className="flex justify-between items-center py-1 border-t border-zinc-900/40 pt-1.5 animate-fade-in">
                  <span className="text-zinc-[450] font-bold">Diterima Melalui</span>
                  <span className="text-xs font-black text-sky-400 font-mono uppercase tracking-wide">
                    Melalui {trx.pembayaranMetode}
                  </span>
                </div>
              )}

              <div className="border-t border-zinc-900 bg-sky-950/20 text-center rounded-xl p-4 flex flex-col justify-center items-center mt-2.5">
                <span className="text-zinc-500 text-[10.5px] font-bold uppercase tracking-wider block mb-0.5">Total Tagihan</span>
                <span className="text-2xl font-black text-sky-450 font-sans tracking-wide">
                  {formatIDR(trx.totalHarga)}
                </span>
              </div>
            </div>
          </div>

          {/* LARGE BLUE LAUNCH BAYAR BUTTON & CANCEL ACTION BUTTON */}
          <div className="flex gap-2.5 w-full">
            <button
              type="button"
              onClick={() => {
                setPaymentStatus(trx.statusBayar === "Lunas" ? "Lunas" : (trx.statusBayar === "DP" ? "DP" : "Lunas"));
                setPaymentDpAmountValue(trx.statusBayar === "DP" && trx.dpAmount ? String(trx.dpAmount) : "");
                setPaymentMethodValue(trx.pembayaranMetode || "Tunai");
                // Extract Kas if any in from notes
                const kasMatch = (trx.notes || "").match(/\[Kas:\s*([^\]]+)\]/);
                setPaymentBukuKas(kasMatch ? kasMatch[1] : "");
                
                const d = new Date();
                const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                setPaymentDate(dateString);

                setShowPaymentSheet(true);
              }}
              className="flex-1 py-4 bg-[#0ea5e9] hover:bg-sky-500 text-white font-black text-xs rounded-xl cursor-pointer active:scale-95 transition-all text-center uppercase tracking-widest block font-sans"
            >
              {trx.statusBayar === "Lunas" || trx.statusBayar === "DP" ? "Detail Pembayaran" : "Bayar / Lunasi Sekarang"}
            </button>

            {(trx.statusBayar === "Lunas" || trx.statusBayar === "DP") && (
              <button
                type="button"
                onClick={() => handleCancelPayment(trx)}
                className="px-4 py-4 border border-rose-950 bg-rose-950/20 hover:bg-rose-900/25 text-rose-500 hover:text-rose-400 font-extrabold text-[10.5px] rounded-xl cursor-pointer active:scale-95 transition-all text-center uppercase tracking-wider font-sans whitespace-nowrap"
                title="Batalkan Pembayaran (Kembali ke Belum Lunas)"
              >
                Cancel Bayar
              </button>
            )}
          </div>
          
          {/* Notes description display if any */}
          {cleanNotes && (
            <div className="bg-[#1C1C1E]/40 border border-zinc-900 rounded-xl p-3 text-left space-y-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Catatan Tambahan:</span>
              <p className="text-[11.5px] text-zinc-300 leading-relaxed font-semibold">{cleanNotes}</p>
            </div>
          )}

        </div>

        {/* BOTTOM ACTION BAR representing Screenshot 2 */}
        <div className="absolute bottom-0 inset-x-0 p-4 bg-[#121214] border-t border-zinc-900 flex gap-3 shrink-0 items-center justify-between z-40">
          <button
            type="button"
            onClick={() => setShowDetailActionsSheet(true)}
            className="w-12 h-12 bg-transparent border border-zinc-800 rounded-xl flex items-center justify-center hover:bg-zinc-900 transition active:scale-90 cursor-pointer"
            title="Menu Opsi"
          >
            <MoreHorizontal className="w-5 h-5 text-zinc-300" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isPrinterConnected() && printerState.connected) {
                handleRealPrint(trx, "label");
              } else {
                setBluetoothPromptTrx({ trx, type: "label" });
              }
            }}
            className="flex-1 py-3.5 bg-[#121214] border border-zinc-800 hover:bg-[#1C1C1E] text-white font-bold text-xs rounded-xl transition active:scale-95 text-center uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-zinc-400" />
            Cetak Label
          </button>

          <button
            type="button"
            onClick={() => {
              if (isPrinterConnected() && printerState.connected) {
                handleRealPrint(trx, "nota");
              } else {
                setBluetoothPromptTrx({ trx, type: "nota" });
              }
            }}
            className="flex-1 py-3.5 bg-[#0ea5e9] hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition active:scale-95 text-center uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-white" />
            Cetak Nota
          </button>
        </div>

        {/* Action Bottom Sheet menu */}
        {showDetailActionsSheet && renderActionSheet(trx)}

        {/* Full-Screen Edit Screen modal */}
        {isEditingTrx && renderEditModal()}

        {/* Dynamic Payment sheet overlay */}
        {showPaymentSheet && (
          <div className="fixed inset-0 bg-black/85 z-70 flex items-end justify-center font-sans pr-1">
            <div className="w-full max-w-[430px] bg-[#121214] border-t border-zinc-800 rounded-t-3xl overflow-hidden animate-slide-up pb-8 flex flex-col text-left">
              
              {/* Header */}
              <div className="px-5 py-5 border-b border-zinc-900/60 flex items-center justify-between bg-[#121214] relative">
                <button 
                  type="button" 
                  onClick={() => setShowPaymentSheet(false)} 
                  className="p-1.5 hover:bg-[#1C1C1E] rounded-lg text-zinc-400 hover:text-white absolute left-4 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="w-full text-center">
                  <span className="text-sm font-black text-white uppercase tracking-wider">Pembayaran</span>
                </div>
              </div>

              {/* Contents scrollable */}
              <div className="p-6 space-y-6 overflow-y-auto no-scrollbar">
                
                {/* Total Tagihan */}
                <div className="space-y-1">
                  <span className="text-zinc-[450] font-bold text-[10.5px] uppercase tracking-wider block">Total Tagihan</span>
                  <span className="text-3xl font-black text-white tracking-wide block font-sans">
                    {formatIDR(trx.totalHarga)}
                  </span>
                </div>

                {/* Status Pembayaran */}
                <div className="space-y-3.5">
                  <label className="text-zinc-[450] font-bold uppercase text-[9.5px] tracking-wider block">Status Pembayaran</label>
                  <div className="flex gap-8">
                    <button
                      type="button"
                      onClick={() => setPaymentStatus("DP")}
                      className="flex items-center gap-3.5 cursor-pointer group"
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        paymentStatus === "DP" ? "border-[#0ea5e9] bg-[#0ea5e9]/10" : "border-zinc-750 group-hover:border-zinc-700"
                      }`}>
                        {paymentStatus === "DP" && (
                          <div className="w-3 h-3 rounded-full bg-[#0ea5e9] animate-scale-in" />
                        )}
                      </div>
                      <span className="text-white text-xs font-extrabold select-none tracking-wide text-zinc-200">DP</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentStatus("Lunas")}
                      className="flex items-center gap-3.5 cursor-pointer group"
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        paymentStatus === "Lunas" ? "border-[#0ea5e9] bg-[#0ea5e9]/10" : "border-zinc-750 group-hover:border-zinc-700"
                      }`}>
                        {paymentStatus === "Lunas" && (
                          <div className="w-3 h-3 rounded-full bg-[#0ea5e9] animate-scale-in" />
                        )}
                      </div>
                      <span className="text-white text-xs font-extrabold select-none tracking-wide text-zinc-200">Lunas</span>
                    </button>
                  </div>
                </div>

                {paymentStatus === "DP" && (
                  <div className="space-y-2 animate-fade-in bg-amber-950/10 border border-amber-900/30 rounded-xl p-4">
                    <label className="text-amber-500 font-bold uppercase text-[9px] tracking-wider block">Nominal DP / Uang Muka</label>
                    <div className="relative mt-1">
                      <input
                        type="text"
                        value={paymentDpAmountValue ? parseInt(paymentDpAmountValue.replace(/[^0-9]/g, ""), 10).toLocaleString("id-ID") : ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "");
                          setPaymentDpAmountValue(val);
                        }}
                        className="w-full bg-[#1C1C1E] border border-zinc-750 rounded-xl px-4 py-3 text-xs text-white font-extrabold font-mono focus:outline-hidden focus:border-amber-500"
                        placeholder="Contoh: 10.000"
                      />
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-zinc-[450] font-black text-[10px] select-none uppercase font-sans tracking-wide">
                        IDR
                      </div>
                    </div>
                    {paymentDpAmountValue && trx.totalHarga > 0 && (
                      <div className="flex justify-between items-center text-[10.5px] font-bold text-zinc-400 mt-2">
                        <span>Sisa Tagihan:</span>
                        <span className="text-rose-450 font-mono">
                          {formatIDR(Math.max(0, trx.totalHarga - (parseInt(paymentDpAmountValue.replace(/[^0-9]/g, ""), 10) || 0)))}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Metode Pembayaran */}
                <div className="space-y-2">
                  <label className="text-zinc-[450] font-bold uppercase text-[9.5px] tracking-wider block">Metode Pembayaran</label>
                  <div className="relative">
                    <select
                      value={paymentMethodValue}
                      onChange={(e) => setPaymentMethodValue(e.target.value as any)}
                      className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3.5 text-xs text-white uppercase font-black appearance-none cursor-pointer focus:outline-hidden focus:border-sky-500"
                    >
                      <option value="Tunai">Tunai</option>
                      <option value="QRIS">QRIS</option>
                      <option value="Transfer">Transfer</option>
                      {(() => {
                        const activeCust = customers.find(c => c.telepon === trx.customerPhone || c.nama === trx.customerName);
                        if (activeCust && activeCust.saldoDeposit !== undefined && activeCust.saldoDeposit > 0) {
                          return (
                            <option value="Saldo Deposit">
                              Saldo Deposit (Sisa: Rp {activeCust.saldoDeposit.toLocaleString("id-ID")})
                            </option>
                          );
                        }
                        return null;
                      })()}
                    </select>
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-zinc-[450] rotate-90">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Buku Kas (Opsional) */}
                <div className="space-y-2">
                  <label className="text-zinc-[450] font-bold uppercase text-[9.5px] tracking-wider block">Buku Kas (Opsional)</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={paymentBukuKas}
                        onChange={(e) => setPaymentBukuKas(e.target.value)}
                        className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3.5 text-xs text-white font-bold appearance-none cursor-pointer focus:outline-hidden focus:border-sky-500"
                      >
                        <option value="">Pilih Buku Kas</option>
                        <option value="Kas Utama">Kas Utama</option>
                        <option value="Kas Kecil">Kas Kecil</option>
                        <option value="Bank BCA">Bank BCA</option>
                        <option value="Bank Mandiri">Bank Mandiri</option>
                      </select>
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-zinc-[450] rotate-90">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                    {paymentBukuKas && (
                      <button
                        type="button"
                        onClick={() => setPaymentBukuKas("")}
                        className="w-12 h-12 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-zinc-400 hover:text-white rounded-xl flex items-center justify-center transition active:scale-90 cursor-pointer"
                        title="Bersihkan pilihan buku kas"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-550 italic font-medium leading-normal">
                    Jika ingin mengubah buku kas menjadi wajib atau opsional silakan ke menu pengaturan outlet
                  </p>
                </div>

                {/* Tanggal Pembayaran */}
                <div className="space-y-2">
                  <label className="text-zinc-[450] font-bold uppercase text-[9.5px] tracking-wider block">Tanggal Pembayaran</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3.5 text-xs text-white font-bold font-mono cursor-pointer focus:outline-hidden focus:border-sky-500"
                    />
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-zinc-[450]">
                      <Calendar className="w-4.5 h-4.5" />
                    </div>
                  </div>
                </div>

                {/* Click Submit Button & Cancel Payment Button Row */}
                <div className="flex gap-2.5 mt-4">
                  {(trx.statusBayar === "Lunas" || trx.statusBayar === "DP") && (
                    <button
                      type="button"
                      onClick={() => handleCancelPayment(trx)}
                      className="flex-1 py-4 border border-rose-950 bg-rose-950/20 hover:bg-rose-900/25 text-rose-500 hover:text-rose-400 font-extrabold text-[11px] rounded-xl cursor-pointer active:scale-95 transition-all text-center uppercase tracking-wider font-sans whitespace-nowrap"
                    >
                      Batal Bayar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSavePayment(trx)}
                    className="flex-1 py-4 bg-[#0ea5e9] hover:bg-sky-500 text-white font-black text-xs rounded-xl cursor-pointer active:scale-95 transition-all text-center uppercase tracking-widest block font-sans shadow-md"
                  >
                    {trx.statusBayar === "Lunas" || trx.statusBayar === "DP" ? "Simpan" : "Bayar"}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Floating notifications toast */}
        {toastMsg && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-sky-500 text-black px-4 py-2 text-[10.5px] font-black rounded-full shadow-2xl z-55 flex items-center gap-2 tracking-wide uppercase animate-bounce">
            <CheckCircle className="w-3.5 h-3.5 stroke-[3px]" />
            <span>{toastMsg}</span>
          </div>
        )}
      </div>
    );
  };

  if (selectedDetailTrx) {
    return renderDetailView(selectedDetailTrx);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans">
      
      {/* Search Header */}
      <div className="p-4 bg-[#121214] border-b border-zinc-900 space-y-3 shrink-0 text-left">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
            <FileText className="w-4 h-4 text-emerald-500" /> OPERASIONAL NOTA LAUNDRY
          </h2>
          <button
            onClick={() => setIsCreatingTrx(true)}
            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500 hover:bg-emerald-450 text-black text-[9.5px] font-black uppercase tracking-wider rounded-none transition shadow-md active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3px]" /> Buat Nota
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Cari transaksi berdasarkan nama/nota..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-850 px-3.5 py-2 pl-9 text-xs text-zinc-100 rounded-none focus:outline-none focus:border-emerald-500 font-semibold"
          />
          <Search className="w-4 h-4 text-zinc-550 absolute left-3 top-2.5" />
        </div>

        {/* Status Filter Tab Buttons */}
        <div className="flex overflow-x-auto gap-1.5 no-scrollbar pb-1 text-[8.5px] font-black uppercase tracking-wider select-none">
          {["Semua", "Antrian", "Proses", "Selesai", "Diambil", "Batal"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 cursor-pointer shrink-0 border rounded-none shadow-xs ${
                statusFilter === st
                  ? "bg-emerald-500 text-black border-emerald-500"
                  : "bg-zinc-950 text-zinc-400 border-zinc-850 hover:text-white hover:border-zinc-700"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {dateFilter && (
        <div className="mx-4 mt-3 bg-zinc-950 border border-zinc-850 px-3.5 py-2.5 flex items-center justify-between text-xs text-left">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse inline-block" />
            <span className="text-zinc-400 font-bold uppercase text-[9px] tracking-wider">Penyaringan Tanggal Masuk:</span>
            <strong className="text-white font-black font-mono tracking-wider">{dateFilter}</strong>
          </div>
          <button
            onClick={() => {
              setDateFilter("");
              if (onClearInitialFilters) onClearInitialFilters();
            }}
            className="px-2 py-1 bg-rose-950/40 border border-rose-900/50 hover:bg-rose-900/30 text-rose-450 hover:text-rose-400 font-bold leading-none uppercase text-[8px] transition active:scale-95 cursor-pointer"
          >
            Hapus Filter
          </button>
        </div>
      )}

      {specialFilter && (
        <div className="mx-4 mt-3 bg-zinc-950 border border-zinc-850 px-3.5 py-2.5 flex items-center justify-between text-xs text-left">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse inline-block" />
            <span className="text-zinc-400 font-bold uppercase text-[9px] tracking-wider">Penyaringan Khusus:</span>
            <strong className="text-white font-black uppercase text-[9.5px] tracking-wider">
              {specialFilter === "dueToday" ? "Harus Selesai Hari Ini" :
               specialFilter === "overdue" ? "Terlambat (Overdue)" :
               specialFilter === "lunasBulanIni" ? "Lunas Bulan Ini (Terbayar)" :
               specialFilter === "dpBulanIni" ? "Deposit (Panjar / DP) Bulan Ini" :
               specialFilter === "paketBulanIni" ? "Transaksi Paket Bulan Ini" :
               specialFilter === "semuaHutang" ? "Semua Piutang / Hutang Belum Lunas" :
               specialFilter === "dpHutang" ? "Piutang Status DP (Sisa Tagihan)" :
               specialFilter === "belumLunasHutang" ? "Outstandings Belum Lunas Sama Sekali" : "Filter Khusus"}
            </strong>
          </div>
          <button
            onClick={() => {
              setSpecialFilter("");
              if (onClearInitialFilters) onClearInitialFilters();
            }}
            className="px-2 py-1 bg-rose-950/40 border border-rose-900/50 hover:bg-rose-900/30 text-rose-450 hover:text-rose-400 font-bold leading-none uppercase text-[8px] transition active:scale-95 cursor-pointer"
          >
            Hapus Filter
          </button>
        </div>
      )}

      {/* Transaction Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredTrx.length === 0 ? (
          <div className="py-12 border border-dashed border-zinc-850 bg-zinc-950/20 text-center rounded-none select-none">
            <span className="text-xs font-black text-zinc-500 uppercase tracking-widest block mb-1">
              Tidak Ada Nota laundry Ditemukan
            </span>
            <p className="text-[10.5px] text-zinc-650 font-bold max-w-[240px] mx-auto text-balance">
              Cobalah sesuaikan kata kunci pemfilteran atau rekam transaksi laundry baru.
            </p>
          </div>
        ) : (
          filteredTrx.map((trx) => {
            const isCompleted = trx.status === "Selesai" || trx.status === "Diambil";
            
            const badgeColorStr = 
              trx.status === "Antrian" ? "bg-zinc-950 text-zinc-400 border-zinc-800" :
              trx.status === "Proses" ? "bg-indigo-950/40 text-indigo-400 border-indigo-900/45" :
              trx.status === "Selesai" ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/50" :
              trx.status === "Diambil" ? "bg-zinc-900 text-zinc-550 border-zinc-850" : "bg-red-950/30 text-rose-500 border-red-900/40";

            return (
              <div 
                key={trx.id}
                onClick={() => setSelectedDetailTrx(trx)}
                className="bg-[#121214] border border-[#27272A] p-4 rounded-xl space-y-3.5 text-left relative cursor-pointer hover:border-zinc-750 transition active:scale-[0.985]"
              >
                {/* Header Row: ID and date */}
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-[#0ea5e9] font-black font-mono tracking-wider text-xs">
                    {trx.id.replace(/-/g, "/")}
                  </span>
                  <span className="text-zinc-500 text-[10px] font-medium font-mono">
                    {formatTanggal(trx.tanggalMasuk)}
                  </span>
                </div>

                {/* Customer row and pricing */}
                <div className="flex justify-between items-center">
                  <span className="text-white font-black text-[13.5px]">
                    {trx.customerName}
                  </span>
                  <span className="text-[#0ea5e9] font-black font-mono text-sm leading-none">
                    {formatIDR(trx.totalHarga)}
                  </span>
                </div>

                {/* Status badges row */}
                <div className="flex justify-between items-center">
                  <span className={`text-[9.5px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                    trx.status === "Antrian" ? "bg-amber-950/40 text-amber-500 border border-amber-900/40" :
                    trx.status === "Proses" ? "bg-indigo-950/45 text-indigo-400 border border-indigo-900/40" :
                    trx.status === "Selesai" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-950/40" :
                    trx.status === "Diambil" ? "bg-zinc-800 text-zinc-400 border border-zinc-700" :
                    "bg-zinc-900 text-zinc-550 border border-zinc-850"
                  }`}>
                    {trx.status}
                  </span>
                  <span className={`text-[9.5px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                    trx.statusBayar === "Lunas"
                      ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/40"
                      : trx.statusBayar === "DP"
                      ? "bg-amber-950/40 text-amber-500 border border-amber-900/40"
                      : "bg-red-950/40 text-rose-500 border border-red-900/40"
                  }`}>
                    {trx.statusBayar === "DP" && trx.dpAmount ? `DP ${formatIDR(trx.dpAmount)}` : trx.statusBayar} {trx.pembayaranMetode ? `via ${trx.pembayaranMetode}` : ""}
                  </span>
                </div>
                
                {/* Subtle horizontal separator */}
                <div className="border-t border-zinc-900/80 my-1" />

                {/* Estimasi Row */}
                <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-500 font-mono">
                  <span>Estimasi Selesai</span>
                  <span className="text-zinc-[350] font-bold">{formatTanggal(trx.estimasiSelesai)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>      {/* DIALOG A: CREATE TRANSACTION MODULE - HIGH FIDELITY LAYOUT MATCHING SCREENSHOT */}
      {isCreatingTrx && (
        <div className="absolute inset-0 bg-[#0A0A0B] z-50 flex flex-col font-sans overflow-hidden h-full w-full">
          <div className="w-full h-full bg-[#0A0A0B] relative text-left flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="px-5 pt-[calc(1.2rem+env(safe-area-inset-top,0px))] pb-4 border-b border-[#27272A] flex items-center justify-between sticky top-0 bg-[#0A0A0B] z-10 md:pt-4">
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => { 
                    setIsCreatingTrx(false); 
                    if (onCloseCreateModalDirectly) onCloseCreateModalDirectly(); 
                  }}
                  className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-300 hover:text-white transition cursor-pointer"
                  title="Kembali"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h3 className="text-sm font-black text-white tracking-wider uppercase font-mono">
                  Tambah Transaksi Baru
                </h3>
              </div>
              <div className="w-5 h-5" />
            </div>

            {/* Form Fields Scroller */}
            <form onSubmit={handleCreateTransaction} className="p-5 space-y-5 overflow-y-auto flex-1 no-scrollbar">
              
              {/* Toggle: Pilih Waktu Transaksi */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 max-w-[80%]">
                  <span className="text-xs font-semibold text-white">Pilih Waktu Transaksi</span>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    Aktifkan jika ingin membuat transaksi yang waktunya sebelum saat ini
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPilihWaktuCustom(!pilihWaktuCustom)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${pilihWaktuCustom ? 'bg-[#0084C7]' : 'bg-zinc-700'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${pilihWaktuCustom ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {pilihWaktuCustom && (
                <div className="space-y-1">
                  <input
                    type="datetime-local"
                    value={customWaktuValue}
                    onChange={(e) => setCustomWaktuValue(e.target.value)}
                    className="w-full text-xs font-semibold bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 text-white focus:outline-none focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7] transition font-mono"
                  />
                </div>
              )}

              {/* Toggle: Transaksi Paket */}
              <div className="flex items-center justify-between pt-1">
                <div className="space-y-0.5 max-w-[80%]">
                  <span className="text-xs font-semibold text-white">Transaksi Paket</span>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    Aktifkan jika ingin melakukan transaksi paket
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTransaksiPaket(!isTransaksiPaket)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isTransaksiPaket ? 'bg-[#0084C7]' : 'bg-zinc-700'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isTransaksiPaket ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Toggle: Rekanan Laundry */}
              <div className="flex items-center justify-between pt-1">
                <div className="space-y-0.5 max-w-[80%]">
                  <span className="text-xs font-semibold text-white">Rekanan Laundry</span>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    Aktifkan jika merupakan transaksi dari rekanan laundry
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRekananLaundry(!isRekananLaundry)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isRekananLaundry ? 'bg-[#0084C7]' : 'bg-zinc-700'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isRekananLaundry ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Pelanggan Box Link selector */}
              <div className="space-y-1.5 pt-1 border-t border-zinc-900/40">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-zinc-350 block">Pelanggan</label>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateCustInline(!createCustInline);
                      setSelectedCustId("");
                    }}
                    className="text-[10px] text-sky-400 hover:text-sky-300 font-bold transition"
                  >
                    {createCustInline ? "Kembali ke Database" : "+ Buat Baru"}
                  </button>
                </div>

                {createCustInline ? (
                  <div className="bg-[#1C1C1E] p-4 border border-zinc-850 rounded-xl space-y-3">
                    <div>
                      <label className="text-[9px] text-zinc-400 font-bold uppercase block mb-1">Nama Customer:</label>
                      <input
                        type="text"
                        placeholder="e.g., Ibu Fatimah"
                        value={customCustName}
                        onChange={(e) => setCustomCustName(e.target.value)}
                        className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-white p-2.5 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-400 font-bold uppercase block mb-1">Nomor WhatsApp:</label>
                      <input
                        type="tel"
                        placeholder="e.g., 0812345678"
                        value={customCustPhone}
                        onChange={(e) => setCustomCustPhone(e.target.value)}
                        className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-white p-2.5 focus:outline-none font-mono"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerSearchQuery("");
                      setIsSelectingCustBottomSheet(true);
                    }}
                    className="w-full text-left text-xs bg-[#1C1C1E] border border-zinc-850 p-3.5 px-4 rounded-xl text-zinc-100 font-medium focus:outline-none flex justify-between items-center cursor-pointer hover:border-zinc-700 transition"
                  >
                    <span className="font-semibold text-zinc-200">
                      {selectedCustId ? (
                        (() => {
                          const found = customers.find(c => c.id === selectedCustId);
                          return found ? `${found.panggilan ? found.panggilan + " " : ""}${found.nama} (${found.telepon})` : "Pilih Pelanggan";
                        })()
                      ) : (
                        <span className="text-zinc-500">Pilih Pelanggan</span>
                      )}
                    </span>
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </button>
                )}
              </div>

              {/* Layanan Laundry Section */}
              <div className="space-y-2 pt-1 border-t border-zinc-900/40">
                <label className="text-xs font-bold text-white block">Layanan Laundry</label>
                
                {/* List of already added services */}
                {selectedLayananList.length > 0 ? (
                  <div className="space-y-2">
                    {selectedLayananList.map((item) => (
                      <div key={item.id} className="bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-xs font-semibold text-white block">{item.nama}</span>
                          <span className="text-[10px] text-zinc-500 font-mono block">
                            {formatIDR(item.harga)} / {getServiceUnitText(item.nama, item.tipe)}
                          </span>
                        </div>
                        
                        {/* Weight multiplier buttons */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center border border-zinc-805 rounded-lg bg-zinc-950/60 overflow-hidden h-7">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLayananList(prev => prev.map(l => {
                                  if (l.id === item.id) {
                                    const parsedNum = parseFloat(String(l.berat).replace(",", ".")) || 0;
                                    const nextBerat = Math.max(0.001, parseFloat((parsedNum - 0.1).toFixed(3)));
                                    return { ...l, berat: nextBerat };
                                  }
                                  return l;
                                }));
                              }}
                              className="w-6 h-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border-r border-zinc-800 text-xs font-bold"
                            >
                              -
                            </button>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.berat === 0 ? "" : item.berat}
                              onChange={(e) => {
                                const valStr = e.target.value.replace(",", ".");
                                if (valStr === "" || /^[0-9]*[.]?[0-9]*$/.test(valStr)) {
                                  setSelectedLayananList(prev => prev.map(l => {
                                    if (l.id === item.id) {
                                      return { ...l, berat: e.target.value };
                                    }
                                    return l;
                                  }));
                                }
                              }}
                              onBlur={() => {
                                setSelectedLayananList(prev => prev.map(l => {
                                  if (l.id === item.id) {
                                    const parsed = parseFloat(String(l.berat).replace(",", ".")) || 1;
                                    return { ...l, berat: parsed };
                                  }
                                  return l;
                                }));
                              }}
                              className="w-14 h-full text-center bg-transparent text-xs font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-sky-500 rounded px-1"
                              placeholder="0"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLayananList(prev => prev.map(l => {
                                  if (l.id === item.id) {
                                    const parsedNum = parseFloat(String(l.berat).replace(",", ".")) || 0;
                                    const nextBerat = parseFloat((parsedNum + 0.1).toFixed(3));
                                    return { ...l, berat: nextBerat };
                                  }
                                  return l;
                                }));
                              }}
                              className="w-6 h-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border-l border-zinc-800 text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                          
                          <span className="text-[10px] text-zinc-400 font-bold uppercase w-8 text-center font-mono">
                            {getServiceUnitText(item.nama, item.tipe)}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLayananList(prev => prev.filter(l => l.id !== item.id));
                            }}
                            className="p-1 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-rose-505 transition"
                            title="Hapus Layanan"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add another service button layout */}
                    <button
                      type="button"
                      onClick={() => {
                        setServiceSearchQuery("");
                        setIsSelectingServiceBottomSheet(true);
                      }}
                      className="w-full text-center text-xs text-sky-400 hover:text-sky-300 font-bold flex items-center justify-center gap-1 py-3 px-4 border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/20 hover:bg-zinc-900/10 rounded-xl transition cursor-pointer mt-1"
                    >
                      <Plus className="w-4 h-4" /> Tambah Layanan Lainnya
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setServiceSearchQuery("");
                      setIsSelectingServiceBottomSheet(true);
                    }}
                    className="w-full text-left text-xs bg-[#1C1C1E] border border-zinc-850 p-3.5 px-4 rounded-xl text-zinc-100 font-medium focus:outline-none flex justify-between items-center cursor-pointer hover:border-zinc-700 transition"
                  >
                    <span className="text-zinc-500">Pilih Jenis Layanan</span>
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </button>
                )}
              </div>

              {/* Biaya Tambahan Section */}
              <div className="space-y-2 pt-1 border-t border-zinc-900/40">
                <label className="text-xs font-bold text-white block">Biaya Tambahan</label>

                {biayaTambahanList.length > 0 ? (
                  <div className="space-y-1.5">
                    {biayaTambahanList.map((item) => (
                      <div key={item.id} className="bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 flex justify-between items-center text-xs">
                        <span className="font-semibold text-zinc-300">{item.nama}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-emerald-400">{formatIDR(item.jumlah)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setBiayaTambahanList(prev => prev.filter(f => f.id !== item.id));
                            }}
                            className="p-1 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-rose-550 transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {!isAddingBiayaInline ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingBiayaInline(true);
                      setTempBiayaNama("");
                      setTempBiayaJumlah(0);
                    }}
                    className="w-full py-3 bg-[#0284c7] hover:bg-sky-500 text-white font-bold text-xs rounded-xl cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5 uppercase tracking-wide"
                  >
                    <Plus className="w-4 h-4" /> Tambah Biaya Tambahan
                  </button>
                ) : (
                  <div className="bg-[#1C1C1E] border border-zinc-800 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-semibold block">Nama Biaya</label>
                        <input
                          type="text"
                          placeholder="Cth: Kilat / Setrika Saja"
                          value={tempBiayaNama}
                          onChange={(e) => setTempBiayaNama(e.target.value)}
                          className="w-full text-xs font-semibold bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-semibold block">Jumlah (Rp)</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={tempBiayaJumlah || ""}
                          onChange={(e) => setTempBiayaJumlah(Number(e.target.value))}
                          className="w-full text-xs font-semibold bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-white focus:outline-none focus:border-sky-500 font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (!tempBiayaNama) {
                            alert("Nama biaya tambahan wajib diisi.");
                            return;
                          }
                          const newItem = {
                            id: "B-ADD-" + Math.random().toString().slice(-4),
                            nama: tempBiayaNama,
                            jumlah: tempBiayaJumlah || 0
                          };
                          setBiayaTambahanList(prev => [...prev, newItem]);
                          setIsAddingBiayaInline(false);
                        }}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-450 text-black font-bold text-xs rounded-lg cursor-pointer transition select-none"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingBiayaInline(false);
                        }}
                        className="px-3 py-2 bg-zinc-805 hover:bg-zinc-750 text-zinc-300 font-bold text-xs rounded-lg cursor-pointer transition"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Estimasi Selesai */}
              <div className="space-y-1.5 pt-1 border-t border-zinc-900/40">
                <label className="text-[11px] font-bold text-zinc-350 block">Estimasi Selesai</label>
                <div className="relative">
                  <input
                    type="datetime-local"
                    value={customEstimasiValue}
                    onChange={(e) => setCustomEstimasiValue(e.target.value)}
                    className="w-full text-xs font-semibold bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 pr-10 text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition font-mono"
                    placeholder="Pilih Estimasi Selesai"
                  />
                  <div className="absolute right-4 top-3.5 pointer-events-none text-zinc-500">
                    <Calendar className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Parfum */}
              <div className="space-y-1.5 pt-1 border-t border-zinc-900/40">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-bold text-zinc-350 block">Parfum (Opsional)</label>
                  <button
                    type="button"
                    onClick={() => {
                      setInlineContext("trx");
                      setShowInlineNewParfumForm(true);
                    }}
                    className="text-[9px] text-sky-400 hover:text-sky-300 font-extrabold uppercase tracking-tight flex items-center gap-0.5"
                  >
                    <span>+ Tambah Parfum</span>
                  </button>
                </div>
                <div className="relative flex items-center">
                  <select
                    value={selectedParfum}
                    onChange={(e) => setSelectedParfum(e.target.value)}
                    className="w-full text-xs font-semibold bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 pr-10 text-zinc-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Pilih Parfum</option>
                    {getPerfumeOptions(selectedParfum).map((pf) => (
                      <option key={pf} value={pf}>{pf}</option>
                    ))}
                  </select>
                  {selectedParfum ? (
                    <button
                      type="button"
                      onClick={() => setSelectedParfum("")}
                      className="absolute right-3.5 text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-800"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <div className="absolute right-4 pointer-events-none text-zinc-500">
                      <ChevronRight className="w-4 h-4 rotate-90" />
                    </div>
                  )}
                </div>
                {showInlineNewParfumForm && inlineContext === "trx" && (
                  <div className="mt-2 p-2.5 bg-zinc-900 border border-[#27272A] rounded-xl space-y-2">
                    <p className="text-[9px] text-zinc-400 font-black uppercase tracking-wider">Tambah Parfum Baru</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nama parfum (contoh: Sakura)"
                        value={inlineNewParfumName}
                        onChange={(e) => setInlineNewParfumName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateInlineParfum("trx");
                          }
                        }}
                        className="flex-1 text-xs font-semibold bg-[#1C1C1E] border border-[#27272A] rounded-lg px-2.5 py-1.5 text-white focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateInlineParfum("trx")}
                        className="px-3 py-1.5 bg-emerald-500 text-black font-extrabold text-[10px] rounded hover:bg-emerald-450 transition active:scale-95"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowInlineNewParfumForm(false);
                          setInlineNewParfumName("");
                        }}
                        className="px-2 py-1.5 bg-zinc-800 text-zinc-400 text-[10px] rounded hover:bg-zinc-700"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Catatan (Opsional) */}
              <div className="space-y-1.5 pt-1 border-t border-zinc-900/40">
                <label className="text-[11px] font-bold text-zinc-350 block">Catatan (Opsional)</label>
                <textarea
                  placeholder=""
                  rows={2}
                  value={trxNotes}
                  onChange={(e) => setTrxNotes(e.target.value)}
                  className="w-full text-xs font-semibold bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all resize-none"
                />
              </div>

              {/* Diskon */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-900/40">
                <span className="text-xs font-semibold text-white">Diskon</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowDiskonInput(!showDiskonInput);
                    if (!showDiskonInput) setDiskonNominal(0);
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showDiskonInput ? 'bg-[#0084C7]' : 'bg-zinc-700'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showDiskonInput ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {showDiskonInput && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-350 block">Nominal Diskon (Rp)</label>
                  <input
                    type="number"
                    placeholder="e.g., 5000"
                    value={diskonNominal || ""}
                    onChange={(e) => setDiskonNominal(Number(e.target.value))}
                    className="w-full text-xs font-semibold bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 text-white focus:outline-none focus:border-[#0284c7] transition font-mono"
                  />
                </div>
              )}

              {/* Status & Metode Bayar */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-900/40">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-zinc-350 block">Status Pembayaran</span>
                  <div className="flex bg-[#1C1C1E] border border-zinc-850 rounded-xl p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setStatusBayar("Belum Lunas")}
                      className={`flex-1 py-2 text-center text-[10px] font-black uppercase rounded-lg transition ${
                        statusBayar === "Belum Lunas"
                          ? "bg-red-950 text-rose-400 border border-red-900"
                          : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                      }`}
                    >
                      BELUM LUNAS
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusBayar("Lunas")}
                      className={`flex-1 py-2 text-center text-[10px] font-black uppercase rounded-lg transition ${
                        statusBayar === "Lunas"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-900"
                          : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                      }`}
                    >
                      LUNAS
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-zinc-350 block">Metode Bayar</span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full text-xs font-semibold bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 text-zinc-100 focus:outline-none cursor-pointer"
                  >
                    <option value="Tunai">Tunai / Cash</option>
                    <option value="QRIS font-mono">QRIS / E-Wallet</option>
                    <option value="Transfer font-mono">Transfer Bank</option>
                    {(() => {
                      if (!selectedCustId) return null;
                      const selC = customers.find(c => c.id === selectedCustId);
                      if (selC) {
                        const saldo = selC.saldoDeposit || 0;
                        return (
                          <option value="Saldo Deposit" className="text-emerald-400">
                            Saldo Deposit (Rp {saldo.toLocaleString("id-ID")})
                          </option>
                        );
                      }
                      return null;
                    })()}
                  </select>
                </div>
              </div>

              {/* Rincian Ringkasan Tagihan */}
              <div className="space-y-2.5 pt-3 border-t border-zinc-900/40 text-[11px]">
                <div className="flex justify-between items-center text-zinc-450">
                  <span>Subtotal</span>
                  <span className="font-mono font-bold">{formatIDR(subtotalBeforeDiskon)}</span>
                </div>
                
                {diskonValue > 0 && (
                  <div className="flex justify-between items-center text-rose-500">
                    <span>Diskon</span>
                    <span className="font-mono font-bold">-{formatIDR(diskonValue)}</span>
                  </div>
                )}

                {nominalPembulatan !== 0 && (
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Pembulatan</span>
                    <span className="font-mono font-bold">
                      {nominalPembulatan > 0 ? "+" : ""}{formatIDR(nominalPembulatan)}
                    </span>
                  </div>
                )}

                {/* Boundary box for custom rounding switch */}
                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => setIsPembulatanActive(!isPembulatanActive)}
                    className={`w-full py-2.5 border border-dashed rounded-xl text-center text-[11px] font-bold tracking-wide transition flex items-center justify-center gap-1.5 ${isPembulatanActive ? "border-[#0084C7] bg-[#0084C7]/10 text-sky-400" : "border-zinc-800 hover:border-zinc-700 text-zinc-550"}`}
                  >
                    {isPembulatanActive ? `✓ Pembulatan Selesai (Ke Atas Rp${pembulatanTipe === "1000" ? "1.000" : "500"})` : "+ Tambah Pembulatan"}
                  </button>

                  {isPembulatanActive && (
                    <div className="flex gap-2 p-1 bg-zinc-950/60 border border-zinc-900 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setPembulatanTipe("500")}
                        className={`flex-1 py-1.5 text-center text-[10px] font-black rounded-lg transition-all ${
                          pembulatanTipe === "500" 
                            ? "bg-[#0084C7] text-white shadow" 
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        Ke Atas Rp500
                      </button>
                      <button
                        type="button"
                        onClick={() => setPembulatanTipe("1000")}
                        className={`flex-1 py-1.5 text-center text-[10px] font-black rounded-lg transition-all ${
                          pembulatanTipe === "1000" 
                            ? "bg-[#0084C7] text-white shadow" 
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        Ke Atas Rp1.000
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </form>

            {/* Blue and black rounded bottom sticky bar */}
            <div className="px-5 pt-4 pb-[calc(1.2rem+env(safe-area-inset-bottom,0px))] border-t border-[#27272A] bg-[#0A0A0B] flex items-center justify-between sticky bottom-0 z-10 md:pb-4">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Total</span>
                <span className="text-lg font-black text-white block font-mono leading-none">
                  {formatIDR(calculatedTotal)}
                </span>
              </div>
              <button
                type="submit"
                onClick={(e) => {
                  e.preventDefault();
                  handleCreateTransaction(e);
                }}
                className="py-3 px-10 bg-[#0284c7] hover:bg-sky-500 text-white font-bold text-[13px] rounded-xl cursor-pointer active:scale-95 transition-all text-center uppercase tracking-wide"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG B: CREATE CUSTOMER - HIGH FIDELITY TAMBAH PELANGGAN MATCHING SCREENSHOT */}
      {isCreatingCust && (
        <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-md z-50 flex items-center justify-center p-3 overflow-y-auto font-sans">
          <div className="w-full max-w-[420px] bg-[#121214] border border-[#27272A] rounded-2xl shadow-2xl relative text-left flex flex-col overflow-hidden max-h-[95vh]">
            
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-900 flex items-center justify-between sticky top-0 bg-[#121214] z-10">
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => { 
                    setIsCreatingCust(false); 
                    if (onCloseCustomerModalDirectly) onCloseCustomerModalDirectly(); 
                  }}
                  className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition"
                  title="Kembali"
                >
                  <X className="w-5 h-5" />
                </button>
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Tambah Pelanggan
                </h3>
              </div>
              <div className="w-5 h-5" />
            </div>

            {/* Form Fields */}
            <form onSubmit={handleCreateCustomer} className="p-5 space-y-5 overflow-y-auto flex-1 no-scrollbar">
              
              {/* Panggilan (Opsional) */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-350 block">
                  Panggilan (Opsional)
                </label>
                <input
                  type="text"
                  placeholder=""
                  value={newCustPanggilan}
                  onChange={(e) => setNewCustPanggilan(e.target.value)}
                  className="w-full text-xs font-medium bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 text-zinc-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                />
                <p className="text-[9.5px] text-zinc-500 font-medium">
                  Misal: Ibu, Bapak, Tuan, Nyonya
                </p>
              </div>

              {/* Nama */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-350 block">
                  Nama
                </label>
                <input
                  type="text"
                  placeholder=""
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full text-xs font-medium bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 text-zinc-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                  required
                />
              </div>

              {/* No. Handphone (Opsional) */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-350 block">
                  No. Handphone (Opsional)
                </label>
                <input
                  type="tel"
                  placeholder=""
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full text-xs font-medium bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 text-zinc-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-mono"
                />
                <p className="text-[9.5px] text-zinc-500 font-medium">
                  Cth: 628987654321
                </p>
              </div>

              {/* Alamat (Opsional) */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-350 block">
                  Alamat (Opsional)
                </label>
                <textarea
                  placeholder=""
                  rows={2}
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full text-xs font-medium bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 text-zinc-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all resize-none"
                />
              </div>

              {/* Parfum (Opsional) */}
              <div className="space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-semibold text-zinc-350 block">
                    Parfum (Opsional)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setInlineContext("cust");
                      setShowInlineNewParfumForm(true);
                    }}
                    className="text-[9px] text-sky-400 hover:text-sky-300 font-extrabold uppercase tracking-tight flex items-center gap-0.5 animate-fade-in"
                  >
                    <span>+ Tambah Parfum</span>
                  </button>
                </div>
                <div className="relative flex items-center">
                  <select
                    value={newCustParfum}
                    onChange={(e) => setNewCustParfum(e.target.value)}
                    className="w-full text-xs font-medium bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3 pr-10 text-zinc-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Pilih Parfum</option>
                    {getPerfumeOptions(newCustParfum).map((pf) => (
                      <option key={pf} value={pf}>{pf}</option>
                    ))}
                  </select>
                  {newCustParfum ? (
                    <button
                      type="button"
                      onClick={() => setNewCustParfum("")}
                      className="absolute right-3.5 text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-800"
                      title="Hapus pilihan"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <div className="absolute right-4.5 pointer-events-none text-zinc-550">
                      <ChevronRight className="w-4 h-4 rotate-90" />
                    </div>
                  )}
                </div>
                {showInlineNewParfumForm && inlineContext === "cust" && (
                  <div className="mt-2 p-2.5 bg-zinc-900 border border-[#27272A] rounded-xl space-y-2">
                    <p className="text-[9px] text-zinc-400 font-black uppercase tracking-wider">Tambah Parfum Baru</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nama parfum (contoh: Sakura)"
                        value={inlineNewParfumName}
                        onChange={(e) => setInlineNewParfumName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateInlineParfum("cust");
                          }
                        }}
                        className="flex-1 text-xs font-semibold bg-[#1C1C1E] border border-[#27272A] rounded-lg px-2.5 py-1.5 text-white focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateInlineParfum("cust")}
                        className="px-3 py-1.5 bg-emerald-500 text-black font-extrabold text-[10px] rounded hover:bg-emerald-450 transition active:scale-95"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowInlineNewParfumForm(false);
                          setInlineNewParfumName("");
                        }}
                        className="px-2 py-1.5 bg-zinc-800 text-zinc-400 text-[10px] rounded hover:bg-zinc-700"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Titik Lokasi Antar/Jemput */}
              <div className="pt-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-semibold text-zinc-350 block">
                    Titik Lokasi Antar/Jemput
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const coordinates = [
                        "Sleman, Condongcatur (-7.7589, 110.4021)",
                        "Yogyakarta City Center (-7.7972, 110.3688)",
                        "Sleman, Depok Raya (-7.7712, 110.3861)",
                        "Bantul, Kasihan (-7.8285, 110.3344)"
                      ];
                      const randomSpot = coordinates[Math.floor(Math.random() * coordinates.length)];
                      setNewCustLokasi(randomSpot);
                      alert(`Koordinat Pinpoint Terpilih: "${randomSpot}"`);
                    }}
                    className="text-xs font-bold text-sky-400 hover:text-sky-300 transition tracking-wider"
                  >
                    Atur
                  </button>
                </div>
                <div className="bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3.5 text-xs font-medium text-zinc-450 flex items-center justify-between">
                  <span>
                    {newCustLokasi ? (
                      <span className="text-emerald-400 font-mono text-[11px] font-bold">📍 {newCustLokasi}</span>
                    ) : (
                      "Belum menentukan lokasi antar/jemput"
                    )}
                  </span>
                  {newCustLokasi && (
                    <button
                      type="button"
                      onClick={() => setNewCustLokasi("")}
                      className="text-[10px] font-semibold text-zinc-500 hover:text-rose-500 ml-2"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 sticky bottom-0 bg-[#121214] pb-2">
                <button
                  type="submit"
                  className="w-full py-3.5 bg-[#0284c7] hover:bg-sky-500 text-white font-bold text-[13px] rounded-xl cursor-pointer shadow-lg shadow-sky-500/10 active:scale-95 transition-all text-center uppercase tracking-wide"
                >
                  Simpan
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* DIALOG C: CREATE SERVICE - HIGH FIDELITY TAMBAH LAYANAN MATCHING SCREENSHOTS */}
      {isCreatingServ && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-md z-55 flex items-center justify-center p-3 overflow-y-auto font-sans">
          <div className="w-full max-w-[430px] bg-[#121214] border border-[#27272A] rounded-2xl shadow-2xl relative text-left flex flex-col overflow-hidden max-h-[96vh]">
            
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-900 flex items-center justify-between sticky top-0 bg-[#121214] z-10">
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => { 
                    setIsCreatingServ(false); 
                    if (onCloseServiceModalDirectly) onCloseServiceModalDirectly(); 
                  }}
                  className="p-1 hover:bg-zinc-805 rounded-lg text-zinc-400 hover:text-white transition"
                  title="Kembali"
                >
                  <X className="w-5 h-5" />
                </button>
                <span className="text-sm font-bold text-white tracking-wide">
                  Tambah Layanan
                </span>
              </div>
              <div className="w-5 h-5" />
            </div>

            {/* Form Fields Scroller */}
            <form onSubmit={handleCreateService} className="p-5 space-y-5 overflow-y-auto flex-1 no-scrollbar pb-24">
              
              {/* Nama Layanan Field */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-zinc-350 block">Nama</span>
                <input
                  type="text"
                  placeholder="Nama layanan"
                  value={newServName}
                  onChange={(e) => setNewServName(e.target.value)}
                  className="w-full text-xs font-semibold bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3.5 text-white placeholder-zinc-650 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                  required
                />
              </div>

              {/* Proses Laundry Field (Cuci, Pengeringan, Setrika, Lipat) */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-zinc-350 block">Proses Laundry</span>
                <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
                  {["Cuci", "Pengeringan", "Setrika", "Lipat"].map((p) => {
                    const isChecked = newServProses.includes(p);
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => {
                          if (isChecked) {
                            setNewServProses(prev => prev.filter(x => x !== p));
                          } else {
                            setNewServProses(prev => [...prev, p]);
                          }
                        }}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold transition text-left select-none ${
                          isChecked 
                            ? "bg-sky-500/10 border-sky-500 text-sky-400" 
                            : "bg-[#1C1C1E] border-zinc-850 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                          isChecked ? "bg-sky-500 border-sky-500 text-white" : "border-[#27272A]"
                        }`}>
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Harga Field */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-zinc-350 block">Harga</span>
                <div className="relative">
                  <span className="absolute left-4 top-[15px] text-xs text-zinc-500 font-bold font-mono">Rp</span>
                  <input
                    type="number"
                    min="100"
                    placeholder="Harga"
                    value={newServPrice || ""}
                    onChange={(e) => setNewServPrice(Number(e.target.value))}
                    className="w-full text-xs font-bold font-mono bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3.5 pl-10 text-white placeholder-zinc-650 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                    required
                  />
                </div>
              </div>

              {/* Durasi Row */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-zinc-350 block">Durasi</span>
                <div className="flex gap-2.5">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      value={newServDurationValue}
                      onChange={(e) => setNewServDurationValue(Number(e.target.value))}
                      className="w-full text-xs font-bold font-mono bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3.5 text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDurasiTipeSheet(true)}
                    className="w-28 text-left text-xs bg-[#1C1C1E] border border-zinc-850 p-3.5 px-4 rounded-xl text-zinc-100 font-semibold focus:outline-none flex justify-between items-center cursor-pointer hover:border-zinc-700"
                  >
                    <span>{newServDurationTipe}</span>
                    <ChevronRight className="w-4 h-4 rotate-90 text-zinc-500" />
                  </button>
                </div>
              </div>

              {/* Satuan Select Dropdown with Bottom Sheet Trigger */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-zinc-350 block">Satuan</span>
                <button
                  type="button"
                  onClick={() => setShowSatuanSheet(true)}
                  className="w-full text-left text-xs bg-[#1C1C1E] border border-zinc-850 p-3.5 px-4 rounded-xl text-zinc-200 font-semibold focus:outline-none flex justify-between items-center cursor-pointer hover:border-zinc-700 transition"
                >
                  <span>{newServType || <span className="text-zinc-550">Pilih Satuan</span>}</span>
                  <ChevronRight className="w-4 h-4 rotate-90 text-zinc-500" />
                </button>
              </div>

              {/* Minimal Kuantitas Field */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-zinc-350 block">Minimal Kuantitas</span>
                <input
                  type="number"
                  min="1"
                  value={newServMinQty}
                  onChange={(e) => setNewServMinQty(Number(e.target.value))}
                  className="w-full text-xs font-bold font-mono bg-[#1C1C1E] border border-zinc-850 rounded-xl p-3.5 text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                  required
                />
              </div>

              {/* Kategori Select with Bottom Sheet style trigger */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-zinc-350 block">Kategori</span>
                <button
                  type="button"
                  onClick={() => setShowKategoriSheet(true)}
                  className="w-full text-left text-xs bg-[#1C1C1E] border border-zinc-850 p-3.5 px-4 rounded-xl text-zinc-200 font-semibold focus:outline-none flex justify-between items-center cursor-pointer hover:border-zinc-700 transition"
                >
                  <span>{newServCategory || "Pilih Kategori"}</span>
                  <ChevronRight className="w-4 h-4 rotate-90 text-zinc-500" />
                </button>
              </div>

              {/* Toggle Sematkan */}
              <div className="flex items-center justify-between py-2 border-t border-zinc-900/40">
                <div className="space-y-0.5 max-w-[80%]">
                  <span className="text-xs font-semibold text-white">Sematkan</span>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    Jika disematkan, maka layanan akan ada di posisi atas
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewServSematkan(!newServSematkan)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${newServSematkan ? 'bg-[#0084C7]' : 'bg-zinc-700'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${newServSematkan ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Bahan-Bahan Section */}
              <div className="space-y-2.5 pt-1 border-t border-zinc-900/40 pb-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-350 block">Bahan-Bahan (Opsional)</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingBahanInline(true);
                      setTempBahanNama("");
                    }}
                    className="px-4 py-1.5 bg-[#0284c7] hover:bg-sky-500 text-white font-bold text-xs rounded-xl cursor-pointer select-none transition"
                  >
                    Tambah
                  </button>
                </div>

                {isAddingBahanInline && (
                  <div className="bg-[#1C1C1E] border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
                    <input
                      type="text"
                      placeholder="Nama bahan / detergen (cth: Parfum Sakura)"
                      value={tempBahanNama}
                      onChange={(e) => setTempBahanNama(e.target.value)}
                      className="w-full text-xs font-semibold bg-[#1C1C1E] border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-sky-500"
                    />
                    <div className="flex justify-end gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          if (tempBahanNama.trim()) {
                            setNewServBahanBahan(prev => [...prev, tempBahanNama.trim()]);
                            setIsAddingBahanInline(false);
                            setTempBahanNama("");
                          }
                        }}
                        className="px-3.5 py-1.5 bg-emerald-500 text-black font-bold rounded-lg cursor-pointer"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingBahanInline(false)}
                        className="px-3.5 py-1.5 bg-zinc-800 text-zinc-300 font-bold rounded-lg cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                {newServBahanBahan.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {newServBahanBahan.map((b, i) => (
                      <div key={i} className="bg-zinc-805/80 border border-zinc-800 pl-3 pr-1.5 py-1 rounded-full flex items-center gap-1.5 text-[11px] text-zinc-300 font-semibold select-none">
                        <span>{b}</span>
                        <button
                          type="button"
                          onClick={() => setNewServBahanBahan(prev => prev.filter((_, idx) => idx !== i))}
                          className="p-0.5 rounded-full hover:bg-zinc-700 text-zinc-500 hover:text-rose-400 transition animate-fade-in"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-5 border border-dashed border-zinc-850 rounded-xl bg-zinc-950/20 text-center select-none">
                    <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-650 mb-1">
                      <FileText className="w-5 h-5 text-zinc-650" />
                    </div>
                    <span className="text-[11px] text-zinc-550 font-bold">Bahan Kosong</span>
                  </div>
                )}
              </div>

            </form>

            {/* Blue sticky bottom bar */}
            <div className="px-5 py-4 border-t border-zinc-900 bg-[#121214] sticky bottom-0 z-10 w-full">
              <button
                type="submit"
                onClick={handleCreateService}
                className="w-full py-3.5 bg-[#0284c7] hover:bg-sky-500 text-white font-bold text-sm rounded-xl cursor-pointer active:scale-95 transition-all text-center uppercase tracking-wide shadow-lg shadow-sky-500/10"
              >
                Simpan
              </button>
            </div>

          </div>

          {/* Bottom Sheet Modal for Units (Satuan) */}
          {showSatuanSheet && (
            <div className="fixed inset-0 bg-black/80 z-60 flex items-end justify-center animate-fade-in font-sans">
              <div className="w-full max-w-[430px] bg-[#121214] border-t border-zinc-800 rounded-t-3xl overflow-hidden animate-slide-up">
                <div className="px-5 py-4 border-b border-zinc-900 flex items-center justify-between bg-[#121214]">
                  <span className="text-sm font-bold text-white">Pilih Satuan</span>
                  <button 
                    type="button" 
                    onClick={() => setShowSatuanSheet(false)} 
                    className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-3 max-h-[40vh] overflow-y-auto no-scrollbar">
                  {["kg", "meter", "pc", "set", "m²", "cm²", "km"].map((unit) => {
                    const isSelected = newServType === unit;
                    return (
                      <button
                        type="button"
                        key={unit}
                        onClick={() => {
                          setNewServType(unit);
                          setShowSatuanSheet(false);
                        }}
                        className={`w-full text-left py-3 px-4 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                          isSelected ? "bg-sky-500/10 text-sky-400 font-bold" : "text-zinc-300 hover:bg-zinc-800/45"
                        }`}
                      >
                        <span>{unit}</span>
                        {isSelected && <Check className="w-4 h-4 text-sky-400 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Sheet Modal for Categories */}
          {showKategoriSheet && (
            <div className="fixed inset-0 bg-black/80 z-60 flex items-end justify-center animate-fade-in font-sans">
              <div className="w-full max-w-[430px] bg-[#121214] border-t border-zinc-800 rounded-t-3xl overflow-hidden animate-slide-up">
                <div className="px-5 py-4 border-b border-zinc-900 flex items-center justify-between bg-[#121214]">
                  <span className="text-sm font-bold text-white">Pilih Kategori</span>
                  <button 
                    type="button" 
                    onClick={() => setShowKategoriSheet(false)} 
                    className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-3 max-h-[40vh] overflow-y-auto no-scrollbar space-y-2">
                  {categoryList.map((cat) => {
                    const isSelected = newServCategory === cat;
                    return (
                      <button
                        type="button"
                        key={cat}
                        onClick={() => {
                          setNewServCategory(cat);
                          setShowKategoriSheet(false);
                        }}
                        className={`w-full text-left py-3 px-4 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                          isSelected ? "bg-sky-500/10 text-sky-400 font-bold" : "text-zinc-300 hover:bg-zinc-800/45"
                        }`}
                      >
                        <span>{cat}</span>
                        {isSelected && <Check className="w-4 h-4 text-sky-400 stroke-[3]" />}
                      </button>
                    );
                  })}

                  {isAddingCategoryInline ? (
                    <div className="border border-zinc-800 bg-zinc-950/40 rounded-xl p-3.5 space-y-2.5 mt-2">
                      <input
                        type="text"
                        placeholder="Nama kategori baru"
                        value={tempCategoryNama}
                        onChange={(e) => setTempCategoryNama(e.target.value)}
                        className="w-full text-xs font-semibold bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-white focus:outline-none focus:border-sky-500"
                        id="customCategoryInput"
                      />
                      <div className="flex justify-end gap-1.5 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = tempCategoryNama.trim();
                            if (trimmed) {
                              if (!categoryList.includes(trimmed)) {
                                setCategoryList(prev => [...prev, trimmed]);
                              }
                              setNewServCategory(trimmed);
                              setTempCategoryNama("");
                              setIsAddingCategoryInline(false);
                              setShowKategoriSheet(false);
                            }
                          }}
                          className="px-3.5 py-1.5 bg-emerald-500 text-black rounded-lg cursor-pointer"
                        >
                          Tambah
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAddingCategoryInline(false)}
                          className="px-3.5 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCategoryInline(true);
                        setTempCategoryNama("");
                      }}
                      className="w-full py-3 bg-[#0284c7] hover:bg-sky-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 uppercase tracking-wide mt-2"
                    >
                      Tambah Kategori
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Sheet Modal for Duration units (Jam, Hari) */}
          {showDurasiTipeSheet && (
            <div className="fixed inset-0 bg-black/80 z-60 flex items-end justify-center animate-fade-in font-sans">
              <div className="w-full max-w-[430px] bg-[#121214] border-t border-zinc-800 rounded-t-3xl overflow-hidden animate-slide-up">
                <div className="px-5 py-4 border-b border-zinc-900 flex items-center justify-between bg-[#121214]">
                  <span className="text-sm font-bold text-white">Pilih Durasi Satuan</span>
                  <button 
                    type="button" 
                    onClick={() => setShowDurasiTipeSheet(false)} 
                    className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-3">
                  {["Jam", "Hari"].map((t) => {
                    const isSelected = newServDurationTipe === t;
                    return (
                      <button
                        type="button"
                        key={t}
                        onClick={() => {
                          setNewServDurationTipe(t as any);
                          setShowDurasiTipeSheet(false);
                        }}
                        className={`w-full text-left py-3.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                          isSelected ? "bg-sky-500/10 text-sky-400 font-bold" : "text-zinc-300 hover:bg-zinc-800/45"
                        }`}
                      >
                        <span>{t}</span>
                        {isSelected && <Check className="w-4 h-4 text-sky-400 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* MODAL PETUNJUK KONEKSI BLUETOOTH PRINTER THERMAL */}
      {bluetoothPromptTrx && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-xs z-60 flex items-center justify-center p-5 font-sans animate-fade-in text-left">
          <div className="w-full max-w-[360px] bg-[#121214] border border-[#27272A] p-5 shadow-2xl relative flex flex-col rounded-xl">
            {/* Outline corner indicators */}
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-emerald-500 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-emerald-500 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-emerald-500 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-emerald-500 rounded-br-lg" />

            <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-zinc-900">
              <Smartphone className="w-5 h-5 text-emerald-400 animate-pulse" />
              <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400">
                Hubungkan Printer Bluetooth
              </h3>
            </div>

            <p className="text-[11px] text-zinc-300 font-semibold leading-relaxed mb-4">
              Fitur ini mengirimkan data cetak secara langsung ke printer thermal fisik Anda menggunakan koneksi Bluetooth nirkabel.
            </p>

            <div className="bg-zinc-950/40 border border-zinc-900 rounded-lg p-3 space-y-2 mb-5">
              <span className="text-[9px] text-[#0ea5e9] font-black uppercase tracking-wider block">
                Langkah-langkah sebelum cetak:
              </span>
              
              <div className="flex items-start gap-2 text-[10.5px]">
                <span className="font-mono font-bold text-emerald-400 bg-emerald-950/40 px-1 py-0.1 border border-emerald-900/30">1</span>
                <p className="text-zinc-400 font-medium leading-relaxed">
                  Aktifkan terlebih dahulu <strong className="text-white">Bluetooth</strong> di Handphone / Tablet / Laptop Anda.
                </p>
              </div>

              <div className="flex items-start gap-2 text-[10.5px]">
                <span className="font-mono font-bold text-emerald-400 bg-emerald-950/40 px-1 py-0.1 border border-emerald-900/30">2</span>
                <p className="text-zinc-400 font-medium leading-relaxed">
                  Nyalakan printer thermal (ukuran kertas 58mm atau 80mm).
                </p>
              </div>

              <div className="flex items-start gap-2 text-[10.5px]">
                <span className="font-mono font-bold text-emerald-400 bg-emerald-950/40 px-1 py-0.1 border border-emerald-900/30">3</span>
                <p className="text-zinc-400 font-medium leading-relaxed">
                  Klik tombol <strong className="text-white">Cari &amp; Pasangkan</strong> di bawah, lalu pilih nama printer Anda.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { trx, type } = bluetoothPromptTrx;
                    setBluetoothPromptTrx(null);
                    
                    const pName = await connectPrinter();
                    setPrinterState({
                      connected: true,
                      name: pName,
                      supported: true
                    });
                    showToast(`Terhubung dengan ${pName}!`);
                    
                    // Trigger real print!
                    setTimeout(() => {
                      handleRealPrint(trx, type);
                    }, 600);
                  } catch (err: any) {
                    if (err.name !== "NotFoundError" && err.name !== "AbortError") {
                      alert("Gagal koneksi Bluetooth: " + (err.message || err));
                    }
                  }
                }}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black text-[10.5px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                <Smartphone className="w-4 h-4 text-black" />
                Cari &amp; Hubungkan Printer
              </button>

              <button
                type="button"
                onClick={() => {
                  const { trx, type } = bluetoothPromptTrx;
                  setBluetoothPromptTrx(null);
                  triggerWebPrint(trx, type, activeCashierName);
                }}
                className="w-full py-3 bg-sky-500 text-white hover:bg-sky-400 text-[10.5px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer text-center flex items-center justify-center gap-1.5 border border-sky-400/20"
              >
                <Printer className="w-4.5 h-4.5 text-white" />
                Cetak via Web / AirPrint (Solusi iPhone)
              </button>

              <button
                type="button"
                onClick={() => {
                  const { trx, type } = bluetoothPromptTrx;
                  setBluetoothPromptTrx(null);
                  handleStartSimulatedPrint(trx, type);
                }}
                className="w-full py-2.5 bg-[#1C1C1E] hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-900 text-[10px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer text-center"
              >
                Simulasi Tampilan Layar Saja
              </button>

              <button
                type="button"
                onClick={() => setBluetoothPromptTrx(null)}
                className="w-full py-2 bg-transparent text-zinc-500 hover:text-zinc-400 text-[9.5px] font-bold uppercase tracking-wider cursor-pointer text-center"
              >
                Kembali / Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MOCK PRINTER BLUEBLUETOOTH BLUETOOTH */}
      {printingTrx && (
        <div className="absolute inset-0 bg-black/95 z-55 flex flex-col justify-between p-6 overflow-y-auto animate-fade-in font-sans">
          
          {/* Bluetooth Connection Quick Panel */}
          <div className="border-b border-zinc-900 pb-3 flex items-center justify-between text-left shrink-0">
            <div className="flex items-center gap-2">
              <Smartphone className={`w-4 h-4 ${printerState.connected ? "text-emerald-500 animate-pulse" : "text-zinc-650"}`} />
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">KONEKSI PRINTER THERMAL</h4>
                <p className="text-[8.5px] text-zinc-500 font-bold uppercase mt-0.5">
                  {printerState.connected ? `Terhubung: ${printerState.name}` : "Gunakan Web Bluetooth untuk Cetak Fisik"}
                </p>
              </div>
            </div>
            
            <div>
              {printerState.connected ? (
                <button
                  onClick={handleDisconnectPrinter}
                  className="px-2 py-1 bg-rose-950/40 text-rose-400 border border-rose-900 rounded-lg text-[8.5px] font-black uppercase cursor-pointer"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnectPrinter}
                  className="px-2.5 py-1.5 bg-emerald-950 text-emerald-400 border border-emerald-900 rounded-lg text-[8.5px] font-black uppercase inline-flex items-center gap-1 cursor-pointer"
                >
                  Hubungkan
                </button>
              )}
            </div>
          </div>

          {/* Active printing progress */}
          {!isPrintFinished ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3 shrink-0">
              <span className="w-12 h-12 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              <p className="text-[10px] text-zinc-400 font-mono font-black uppercase tracking-widest animate-pulse">
                {btsPrinting ? "Mengirim paket cetak data fisik..." : "Memproses simulasi cetak..."} {printingProgress}%
              </p>
              <div className="w-40 h-2 bg-zinc-950 border border-zinc-900 rounded-none overflow-hidden">
                <div style={{ width: `${printingProgress}%` }} className="h-full bg-emerald-500 transition-all duration-300" />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-4 space-y-4">
              
              {/* POS Thermal simulation layouts depending on printType */}
              {printType === "nota" ? (
                <div className="w-[240px] bg-white text-black p-4 font-mono text-[9px] border-b-4 border-dashed border-zinc-400 text-left leading-normal shadow-2xl relative select-text selection:bg-emerald-250">
                  <div className="text-center font-black space-y-0.5 mb-2 border-b border-dashed border-black pb-2">
                    <span className="block text-xs uppercase tracking-tight">DAMDAM LAUNDRY</span>
                    <span className="block text-[7.5px] font-bold">Jl. Damai Raya No. 42, Sleman</span>
                    <span className="block text-[7.5px] font-bold">Telp: 0812-3456-789</span>
                  </div>

                  <div className="space-y-0.5 border-b border-dashed border-black pb-2 mb-2">
                    <p>Nota: <span className="font-bold">{printingTrx.id}</span></p>
                    <p>Kasir: {activeCashierName}</p>
                    <p>Cust: <span className="font-bold">{printingTrx.customerName}</span></p>
                    {printingTrx.customerPhone && <p>Telp: {printingTrx.customerPhone}</p>}
                    <p>Masuk: {formatTanggal(printingTrx.tanggalMasuk)}</p>
                  </div>

                  <div className="space-y-1 mb-2">
                    <div className="flex justify-between items-start font-bold">
                      <span>{printingTrx.layananNama}</span>
                    </div>
                    <div className="flex justify-between pl-2">
                      <span>{printingTrx.berat} x {formatIDR(printingTrx.totalHarga / (printingTrx.berat || 1))}</span>
                      <span>{formatIDR(printingTrx.totalHarga)}</span>
                    </div>
                    {printingTrx.parfum && (
                      <p className="pl-2 italic">&bull; Parfum: {printingTrx.parfum}</p>
                    )}
                    {printingTrx.notes && (
                      <p className="pl-2 italic text-[8px]">&bull; Catatan: {printingTrx.notes}</p>
                    )}
                  </div>

                  <div className="border-t border-dashed border-black pt-2 space-y-0.5 border-b mb-2 pb-2">
                    <div className="flex justify-between font-black text-[10px]">
                      <span>TOTAL TAGIHAN:</span>
                      <span>{formatIDR(printingTrx.totalHarga)}</span>
                    </div>
                    {printingTrx.statusBayar === "DP" && printingTrx.dpAmount && (
                      <>
                        <div className="flex justify-between text-[8px]">
                          <span>Uang Muka (DP):</span>
                          <span>{formatIDR(printingTrx.dpAmount)}</span>
                        </div>
                        <div className="flex justify-between text-[8px] font-bold">
                          <span>Sisa Tagihan:</span>
                          <span>{formatIDR(printingTrx.totalHarga - printingTrx.dpAmount)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between text-[8px]">
                      <span>Status Bayar:</span>
                      <span className="font-bold uppercase">{printingTrx.statusBayar}</span>
                    </div>
                    <div className="flex justify-between text-[8px]">
                      <span>Metode:</span>
                      <span>{printingTrx.pembayaranMetode}</span>
                    </div>
                    <div className="flex justify-between text-[8.5px] font-bold">
                      <span>Estimasi Selesai:</span>
                      <span>{formatTanggal(printingTrx.estimasiSelesai)}</span>
                    </div>
                  </div>

                  <div className="text-center font-bold text-[8px] pt-1">
                    <p>TERIMA KASIH ATAS KUNJUNGANNYA</p>
                    <p>Pekat Bersih, Hidup Berkah!</p>
                  </div>
                </div>
              ) : (
                <div className="w-[240px] bg-white text-black p-4 font-mono text-[9.5px] border-2 border-zinc-350 rounded-lg text-left leading-normal shadow-2xl relative">
                  <div className="text-center font-black space-y-0.5 mb-2 border-b-2 border-black pb-2">
                    <span className="block text-sm uppercase tracking-wider font-extrabold text-center">DAMDAM</span>
                    <span className="block text-[8px] font-bold text-zinc-600 text-center">LABEL PENANDA PACKING</span>
                  </div>

                  <div className="space-y-1 pb-2 border-b border-dashed border-black">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[9px] text-zinc-500">KODE:</span>
                      <span className="text-[17px] font-black tracking-tight">{printingTrx.id.substring(4)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-500">NOTA:</span>
                      <span className="font-bold text-[9.5px] ml-1">{printingTrx.id}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-500">NAMA:</span>
                      <span className="font-black text-xs ml-1 uppercase">{printingTrx.customerName}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-500">BERAT:</span>
                      <span className="font-extrabold ml-1">{printingTrx.berat} Kg / Pcs</span>
                    </div>
                  </div>

                  <div className="space-y-1 py-1.5 border-b border-dashed border-black text-[9px]">
                    <div>
                      <span className="text-zinc-500">LAYANAN:</span>
                      <span className="font-bold ml-1">{printingTrx.layananNama.split(" (")[0]}</span>
                    </div>
                    {printingTrx.parfum && (
                      <div>
                        <span className="text-zinc-500">PARFUM:</span>
                        <span className="font-bold ml-1">{printingTrx.parfum}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-zinc-500">SELESAI:</span>
                      <span className="font-bold ml-1">{formatTanggal(printingTrx.estimasiSelesai)}</span>
                    </div>
                  </div>

                  <div className="text-center font-black text-[8px] pt-2 pb-0.5 text-zinc-700">
                    * JANGAN HILANG ATAU TERTUKAR *
                  </div>
                </div>
              )}

              {/* Interaction Details Feedback */}
              <div className="text-center space-y-1 shrink-0">
                <span className="inline-flex bg-emerald-950 text-emerald-400 border border-emerald-950 font-bold px-2.5 py-1 text-[9px] uppercase tracking-wider items-center gap-1 rounded-sm">
                  <CheckCircle className="w-3.5 h-3.5" /> Berhasil Diproses!
                </span>
                <p className="text-[8.5px] text-zinc-500 font-black uppercase tracking-wide">
                  {printerState.connected 
                    ? `Sudah ditransmisikan ke printer ${printerState.name}` 
                    : "Simulasi selesai. Hubungkan printer fisik via Bluetooth"}
                </p>
              </div>

              {/* Reprint triggers if physical is connected */}
              {printerState.connected && (
                <div className="flex gap-2 w-full max-w-[240px]">
                  <button
                    onClick={() => handleRealPrint(printingTrx, "nota")}
                    className="flex-1 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold text-[9px] uppercase hover:bg-zinc-800 transition"
                  >
                    Print Nota (BT)
                  </button>
                  <button
                    onClick={() => handleRealPrint(printingTrx, "label")}
                    className="flex-1 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold text-[9px] uppercase hover:bg-zinc-800 transition"
                  >
                    Print Label (BT)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bottom Action Footer */}
          <div className="space-y-2 mt-3 shrink-0">
            {!printerState.connected && isPrintFinished && (
              <button
                type="button"
                onClick={handleConnectPrinter}
                className="w-full py-2.5 bg-sky-500 text-black text-xs font-black uppercase tracking-wide cursor-pointer"
              >
                Hubungkan Printer Fisik via Bluetooth
              </button>
            )}
            <button
              onClick={() => setPrintingTrx(null)}
              className="w-full py-3 bg-[#1C1C1E] border border-zinc-900 hover:bg-zinc-900 text-white text-xs font-black tracking-widest uppercase transition"
            >
              KEMBALI KE TRANSAKSI
            </button>
          </div>
        </div>
      )}

      {/* DIALOG D: CHOOSE CUSTOMER BOTTOM SHEET - MATCHES SCREENSHOT 2 */}
      {isSelectingCustBottomSheet && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xs z-55 flex flex-col justify-end p-0 font-sans">
          <div 
            className="absolute inset-0" 
            onClick={() => setIsSelectingCustBottomSheet(false)}
          />

          <div className="w-full max-w-[420px] mx-auto bg-[#121214] border-t border-[#27272A] rounded-t-2xl shadow-2xl relative z-10 flex flex-col max-h-[85vh] overflow-hidden text-left pb-6">
            
            <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto my-3 shrink-0" />

            <div className="px-5 pb-3 flex items-center justify-between border-b border-zinc-900/60 shrink-0">
              <h4 className="text-base font-bold text-white text-center w-full relative">
                Pilih Pelanggan
                <button 
                  type="button"
                  onClick={() => setIsSelectingCustBottomSheet(false)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </h4>
            </div>

            {/* Search Input Container */}
            <div className="p-4 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari nama pelanggan"
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3 pl-11 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-sky-500 font-medium"
                />
                <Search className="w-4 h-4 text-zinc-650 absolute left-4 top-3.5" />
                {customerSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCustomerSearchQuery("")}
                    className="absolute right-4 top-3.5 text-zinc-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Customer List Area */}
            <div className="flex-1 overflow-y-auto px-5 divide-y divide-zinc-900/60 no-scrollbar">
              {(() => {
                const results = customers.filter(c => 
                  c.nama.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                  c.telepon.includes(customerSearchQuery)
                );

                if (results.length === 0) {
                  return (
                    <div className="py-12 text-center text-zinc-500 font-semibold text-xs uppercase tracking-wider">
                      Tidak ada pelanggan ditemukan
                    </div>
                  );
                }

                return results.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustId(c.id);
                      if (c.parfumFavorit) {
                        setSelectedParfum(c.parfumFavorit);
                      }
                      setIsSelectingCustBottomSheet(false);
                    }}
                    className="w-full text-left py-4 px-2 hover:bg-zinc-900/40 text-xs font-semibold text-zinc-300 hover:text-white flex justify-between items-center transition"
                  >
                    <span>
                      {c.panggilan ? `${c.panggilan} ` : ""}{c.nama}{" "}
                      <span className="text-zinc-500 font-medium ml-1">({c.telepon})</span>
                    </span>
                    {selectedCustId === c.id && (
                      <Check className="w-4 h-4 text-sky-450 stroke-[3px]" />
                    )}
                  </button>
                ));
              })()}
            </div>

            {/* Blue Add Customer Action Button exactly as screenshot 2 */}
            <div className="px-5 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsSelectingCustBottomSheet(false);
                  setIsCreatingCust(true);
                }}
                className="w-full py-4 bg-[#0284c7] hover:bg-sky-500 text-white font-bold text-[13px] rounded-xl cursor-pointer active:scale-95 transition-all text-center uppercase tracking-wide"
              >
                Tambah Pelanggan
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DIALOG E: CHOOSE SERVICE BOTTOM SHEET - MATCHES CUSTOMER SELECTION STYLE */}
      {isSelectingServiceBottomSheet && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xs z-55 flex flex-col justify-end p-0 font-sans">
          <div 
            className="absolute inset-0" 
            onClick={() => setIsSelectingServiceBottomSheet(false)}
          />

          <div className="w-full max-w-[420px] mx-auto bg-[#121214] border-t border-[#27272A] rounded-t-2xl shadow-2xl relative z-10 flex flex-col max-h-[85vh] overflow-hidden text-left pb-6">
            
            <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto my-3 shrink-0" />

            <div className="px-5 pb-3 flex items-center justify-between border-b border-zinc-900/60 shrink-0">
              <h4 className="text-base font-bold text-white text-center w-full relative">
                Pilih Layanan
                <button 
                  type="button"
                  onClick={() => setIsSelectingServiceBottomSheet(false)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </h4>
            </div>

            {/* Search Input Container */}
            <div className="p-4 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari jenis layanan laundry..."
                  value={serviceSearchQuery}
                  onChange={(e) => setServiceSearchQuery(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-zinc-850 rounded-xl px-4 py-3 pl-11 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-sky-500 font-medium"
                />
                <Search className="w-4 h-4 text-zinc-650 absolute left-4 top-3.5" />
                {serviceSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setServiceSearchQuery("")}
                    className="absolute right-4 top-3.5 text-zinc-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Service List Area */}
            <div className="flex-1 overflow-y-auto px-5 divide-y divide-zinc-900/60 no-scrollbar">
              {(() => {
                const results = services.filter(s => 
                  s.nama.toLowerCase().includes(serviceSearchQuery.toLowerCase()) ||
                  s.kategori?.toLowerCase().includes(serviceSearchQuery.toLowerCase())
                );

                if (results.length === 0) {
                  return (
                    <div className="py-12 text-center text-zinc-500 font-semibold text-xs uppercase tracking-wider">
                      Tidak ada layanan ditemukan
                    </div>
                  );
                }

                return results.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setTempServiceId(s.id);
                      setSelectedServiceId(s.id);
                      
                      // Add to selected list (allow multiple of same service)
                      const newlyAdded = {
                        id: "L-ADD-" + Math.random().toString().slice(-4),
                        serviceId: s.id,
                        nama: s.nama,
                        berat: s.minimalKuantitas || 1, // utilize minimum quantity
                        harga: s.harga,
                        tipe: s.tipe
                      };
                      setSelectedLayananList(prev => [...prev, newlyAdded]);
                      
                      setIsSelectingServiceBottomSheet(false);
                    }}
                    className="w-full text-left py-4 px-2 hover:bg-zinc-900/40 text-xs font-semibold text-zinc-300 hover:text-white flex justify-between items-center transition"
                  >
                    <div>
                      <span className="block text-white font-semibold">{s.nama}</span>
                      <span className="text-zinc-500 font-medium text-[10px] block mt-0.5">
                        {formatIDR(s.harga)} / {getServiceUnitText(s.nama, s.tipe)} • {s.kategori || "Reguler"} ({s.durasiJam} Jam)
                      </span>
                    </div>
                    {selectedLayananList.some(item => item.serviceId === s.id) && (
                      <Check className="w-4 h-4 text-sky-450 stroke-[3px]" />
                    )}
                  </button>
                ));
              })()}
            </div>

            {/* Blue Add Service Action Button */}
            <div className="px-5 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsSelectingServiceBottomSheet(false);
                  setIsCreatingServ(true);
                }}
                className="w-full py-4 bg-[#0284c7] hover:bg-sky-500 text-white font-bold text-[13px] rounded-xl cursor-pointer active:scale-95 transition-all text-center uppercase tracking-wide"
              >
                Buat Layanan Baru
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
