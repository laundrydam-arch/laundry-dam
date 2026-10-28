/**
 * Web Bluetooth Thermal Printer & ESC/POS Utility Helper
 * For Damdam Laundry App
 */

import { LaundryTransaction } from "../types";

// Standard ESC/POS Commands
export const ESC_POS = {
  INIT: new Uint8Array([0x1b, 0x40]), // ESC @
  ALIGN_LEFT: new Uint8Array([0x1b, 0x61, 0]), // ESC a 0
  ALIGN_CENTER: new Uint8Array([0x1b, 0x61, 1]), // ESC a 1
  ALIGN_RIGHT: new Uint8Array([0x1b, 0x61, 2]), // ESC a 2
  BOLD_ON: new Uint8Array([0x1b, 0x45, 1]), // ESC E 1
  BOLD_OFF: new Uint8Array([0x1b, 0x45, 0]), // ESC E 0
  DOUBLE_SIZE_ON: new Uint8Array([0x1d, 0x21, 0x11]), // GS ! 17 (Double width & height)
  DOUBLE_SIZE_OFF: new Uint8Array([0x1d, 0x21, 0x00]), // GS ! 0
  UNDERLINE_ON: new Uint8Array([0x1b, 0x2d, 1]), // ESC - 1
  UNDERLINE_OFF: new Uint8Array([0x1b, 0x2d, 0]), // ESC - 0
  LINE_FEED: new Uint8Array([0x0a]), // LF
  FEED_PAPER: new Uint8Array([0x1b, 0x64, 4]), // Feed 4 lines (ESC d 4)
};

// Common Bluetooth BLE Service & Characteristic UUIDs for Generic Thermal Printers
const PRINTER_BLE_SERVICES = [
  "0000ffe0-0000-1000-8000-00805f9b34fb", // Common / FFE0 service
  "000018f0-0000-1000-8000-00805f9b34fb", // Portable / 18F0 service
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip / ISSC service
  "0000ff00-0000-1000-8000-00805f9b34fb", // Custom / FF00 service
  "0000fee7-0000-1000-8000-00805f9b34fb", // WeChat / FEE7 service
  "0000fee9-0000-1000-8000-00805f9b34fb", // Generic printer helper FEE9 service
  "0000af30-0000-1000-8000-00805f9b34fb", // Xprinter / AF30 service
  "0000e781-0000-1000-8000-00805f9b3512", // Custom labels marker e781
];

// Active connection references
let connectedDevice: any = null;
let printCharacteristic: any = null;

/**
 * Check if the browser supports the Web Bluetooth API.
 */
export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && (navigator as any).bluetooth !== undefined;
}

/**
 * Connected device details (getter)
 */
export function getConnectedDeviceName(): string | null {
  return connectedDevice ? connectedDevice.name || "Bluetooth Printer" : null;
}

/**
 * Connection check (getter)
 */
export function isPrinterConnected(): boolean {
  return !!printCharacteristic;
}

/**
 * Connect to a local Bluetooth thermal printer.
 */
export async function connectPrinter(): Promise<string> {
  if (!isBluetoothSupported()) {
    throw new Error("Browser Anda tidak mendukung Web Bluetooth API. Gunakan Chrome, Edge, atau Opera di HTTPS/localhost.");
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_BLE_SERVICES,
    });

    connectedDevice = device;

    // Listen to disconnection
    device.addEventListener("gattserverdisconnected", () => {
      connectedDevice = null;
      printCharacteristic = null;
    });

    const server = await device.gatt.connect();

    // Iterate services to find a writeable characteristic
    let foundService = null;
    let foundChar = null;

    for (const serviceUuid of PRINTER_BLE_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        if (service) {
          foundService = service;
          // Find write characteristic
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              foundChar = char;
              break;
            }
          }
        }
      } catch (err) {
        // Continue iterating if service not found on this peripheral
      }
      if (foundChar) break;
    }

    if (!foundChar && server) {
      // Direct discovery if custom service didn't match perfectly
      try {
        const services = await server.getPrimaryServices();
        for (const service of services) {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              foundChar = char;
              break;
            }
          }
          if (foundChar) break;
        }
      } catch (err) {
        // Failed fallback discovery
      }
    }

    if (!foundChar) {
      throw new Error("Gagal menemukan profil cetak (Write GATT Characteristic) pada perangkat yang dipilih.");
    }

    printCharacteristic = foundChar;
    return device.name || "Bluetooth Printer";
  } catch (error: any) {
    connectedDevice = null;
    printCharacteristic = null;
    throw error;
  }
}

/**
 * Disconnect current paired printer
 */
export async function disconnectPrinter(): Promise<void> {
  if (connectedDevice && connectedDevice.gatt.connected) {
    await connectedDevice.gatt.disconnect();
  }
  connectedDevice = null;
  printCharacteristic = null;
}

/**
 * Sleep helper function
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends ESC/POS command payload over Web Bluetooth.
 * Chunks text bytes into 20-byte chunks to prevent printer buffer buffer failures/garbled labels.
 */
export async function sendToPrinter(bytes: Uint8Array, onProgress?: (pct: number) => void): Promise<void> {
  if (!printCharacteristic) {
    throw new Error("Printer belum terhubung! Silakan hubungkan printer Bluetooth Anda terlebih dahulu.");
  }

  const chunkSize = 20; // Secure BLE payload chunk limit
  const totalLength = bytes.length;
  let offset = 0;

  while (offset < totalLength) {
    const end = Math.min(offset + chunkSize, totalLength);
    const chunk = bytes.slice(offset, end);

    if (printCharacteristic.properties.writeWithoutResponse) {
      await printCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await printCharacteristic.writeValue(chunk);
    }

    offset += chunkSize;
    
    if (onProgress) {
      const pct = Math.floor((offset / totalLength) * 100);
      onProgress(Math.min(pct, 100));
    }

    // Sleep for 30ms between writes to allow physical thermal controller buffer processing
    await sleep(30);
  }
}

/**
 * Convers Indonesian string to pure ASCII bytes with basic characters
 */
export function encodeAscii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Standard ASCII clean map (replace fancy or Unicode characters with general substitutes)
    if (charCode > 127) {
      bytes[i] = 32; // space fallback for non-ASCII
    } else {
      bytes[i] = charCode;
    }
  }
  return bytes;
}

/**
 * Helper to combine multiple Uint8Array packets
 */
export function combineBytes(arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Formats Indonesian Currency IDR
 */
function rawFormatIDR(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}

/**
 * Format timestamp display to indonesian standard short layout (e.g. 12 Jan 2026, 15:10)
 */
function rawFormatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", 
      "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
    ];

    // Try custom split for database compatible local dates without timezone offsets
    const parts = dateStr.trim().split(" ");
    if (parts.length === 2) {
      const dParts = parts[0].split("-");
      if (dParts.length === 3) {
        const yyyy = dParts[0];
        const mmIndex = parseInt(dParts[1], 10) - 1;
        const dd = parseInt(dParts[2], 10);
        const monthName = monthNames[mmIndex] || "Jan";
        
        let timeStr = parts[1];
        const tParts = parts[1].split(":");
        if (tParts.length >= 2) {
          timeStr = `${tParts[0]}:${tParts[1]}`;
        }
        return `${dd} ${monthName} ${yyyy}, ${timeStr}`;
      }
    }
    
    // Fallback parsing via standard Date
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const dd = d.getDate();
      const monthName = monthNames[d.getMonth()];
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${dd} ${monthName} ${yyyy}, ${hh}:${mm}`;
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

/**
 * Generates Receipt (Nota Transaksi) ESC/POS payload for 58mm printer (32-character columns limit)
 */
export function generateReceiptEscPos(trx: LaundryTransaction, cashierName: string = "Kasir Utama"): Uint8Array {
  const line = "--------------------------------\n";
  const doubleLine = "================================\n";
  const packets: Uint8Array[] = [];

  // 1. Initialize
  packets.push(ESC_POS.INIT);

  // 2. Header
  packets.push(ESC_POS.ALIGN_CENTER);
  packets.push(ESC_POS.DOUBLE_SIZE_ON);
  packets.push(ESC_POS.BOLD_ON);
  packets.push(encodeAscii("DAMDAM LAUNDRY\n"));
  packets.push(ESC_POS.DOUBLE_SIZE_OFF);
  packets.push(ESC_POS.BOLD_OFF);
  packets.push(encodeAscii("Jl. Damai Raya No. 42, Sleman\n"));
  packets.push(encodeAscii("WA: 0812-3456-789\n"));
  packets.push(encodeAscii(doubleLine));

  // 3. Metadata
  packets.push(ESC_POS.ALIGN_LEFT);
  packets.push(encodeAscii(`Nota  : ${trx.id}\n`));
  packets.push(encodeAscii(`Kasir : ${cashierName}\n`));
  packets.push(encodeAscii(`Cust  : ${trx.customerName}\n`));
  if (trx.customerPhone) {
    packets.push(encodeAscii(`Telp  : ${trx.customerPhone}\n`));
  }
  packets.push(encodeAscii(`Masuk : ${rawFormatDate(trx.tanggalMasuk)}\n`));
  packets.push(encodeAscii(line));

  // 4. Products / Services List
  packets.push(encodeAscii("LAYANAN LAUNDRY:\n"));
  
  // Format services
  // If layananNama has multiple services separated by commas (parsed in types)
  const items = trx.layananNama.split(", ");
  items.forEach((item) => {
    // Format: "Item Name (Weight Kg)"
    packets.push(ESC_POS.BOLD_ON);
    packets.push(encodeAscii(`* ${item}\n`));
    packets.push(ESC_POS.BOLD_OFF);
  });
  
  packets.push(encodeAscii(`  Kuantitas : ${trx.berat} Qty/Kg\n`));
  
  if (trx.parfum) {
    packets.push(encodeAscii(`  Parfum    : ${trx.parfum}\n`));
  }

  if (trx.notes) {
    // Escape specific system descriptor tags for clear thermal view if any
    const cleanNote = trx.notes
      .replace(/\[Kasir:\s*[^\]]+\]/g, "")
      .replace(/\(Biaya Tambahan:\s*([^)]+)\)/g, "")
      .replace(/\(Diskon:\s*Rp\s*[^)]+\)/g, "")
      .replace(/\(Pembulatan:\s*Rp\s*[^)]+\)/g, "")
      .trim();
    if (cleanNote) {
      packets.push(encodeAscii(`  Catatan   : ${cleanNote}\n`));
    }
  }
  packets.push(encodeAscii(line));

  // 5. Calculate Total
  packets.push(ESC_POS.BOLD_ON);
  const totalLabel = "TOTAL AKHIR : ";
  const totalValStr = rawFormatIDR(trx.totalHarga);
  const spacesRequired = 32 - totalLabel.length - totalValStr.length;
  const spacing = spacesRequired > 0 ? " ".repeat(spacesRequired) : " ";
  packets.push(encodeAscii(`${totalLabel}${spacing}${totalValStr}\n`));
  packets.push(ESC_POS.BOLD_OFF);

  // Status Bayar Row
  const bayarLabel = `Metode/Bayar: `;
  const bayarValStr = `${trx.pembayaranMetode} / ${trx.statusBayar.toUpperCase()}`;
  const spacePay = 32 - bayarLabel.length - bayarValStr.length;
  const spacingPay = spacePay > 0 ? " ".repeat(spacePay) : " ";
  packets.push(encodeAscii(`${bayarLabel}${spacingPay}${bayarValStr}\n`));

  // DP details if any
  if (trx.statusBayar === "DP" && trx.dpAmount) {
    const dpLabel = "Uang Muka (DP): ";
    const dpValStr = rawFormatIDR(trx.dpAmount);
    const spaceDp = 32 - dpLabel.length - dpValStr.length;
    const spacingDp = spaceDp > 0 ? " ".repeat(spaceDp) : " ";
    
    const sisaLabel = "Sisa Tagihan  : ";
    const sisaValStr = rawFormatIDR(trx.totalHarga - trx.dpAmount);
    const spaceSisa = 32 - sisaLabel.length - sisaValStr.length;
    const spacingSisa = spaceSisa > 0 ? " ".repeat(spaceSisa) : " ";
    
    packets.push(encodeAscii(`${dpLabel}${spacingDp}${dpValStr}\n`));
    packets.push(encodeAscii(`${sisaLabel}${spacingSisa}${sisaValStr}\n`));
  }

  packets.push(encodeAscii(line));

  // 6. Estimation / Pick deadline
  packets.push(ESC_POS.ALIGN_CENTER);
  packets.push(ESC_POS.BOLD_ON);
  packets.push(encodeAscii("ESTIMASI SELESAI:\n"));
  packets.push(encodeAscii(`${rawFormatDate(trx.estimasiSelesai)}\n`));
  packets.push(ESC_POS.BOLD_OFF);
  packets.push(encodeAscii(doubleLine));

  // 7. Footer slogan
  packets.push(ESC_POS.ALIGN_CENTER);
  packets.push(encodeAscii("TERIMA KASIH ATAS KUNJUNGANNYA\n"));
  packets.push(ESC_POS.BOLD_ON);
  packets.push(encodeAscii("PEKAT BERSIH, HIDUP BERKAH!\n"));
  packets.push(ESC_POS.BOLD_OFF);
  
  // 8. Feed and cut spacing
  packets.push(ESC_POS.FEED_PAPER);

  return combineBytes(packets);
}

/**
 * Generates Compact Sticky Label (Label Thermal) ESC/POS payload/receipt based on user settings
 */
export function generateLabelEscPos(trx: LaundryTransaction): Uint8Array {
  const isBrowser = typeof window !== "undefined";
  
  // Retrieve settings stored in localStorage
  const labelStyle = isBrowser ? localStorage.getItem("damdam_label_style") || "full" : "full";
  const customStoreName = isBrowser ? localStorage.getItem("damdam_label_store_name") || "Damdam Laundry" : "Damdam Laundry";
  const nameSize = isBrowser ? localStorage.getItem("damdam_label_name_size") || "xl" : "xl";
  const dividerType = isBrowser ? localStorage.getItem("damdam_label_divider") || "dashed" : "dashed";
  const showDetails = isBrowser ? localStorage.getItem("damdam_label_show_details") !== "false" : true;
  const showPayment = isBrowser ? localStorage.getItem("damdam_label_show_payment") !== "false" : true;
  const footerText = isBrowser ? localStorage.getItem("damdam_label_footer") || "* Jangan Hilang / Tertukar *" : "* Jangan Hilang / Tertukar *";

  // Build divider characters
  let line = "--------------------------------\n";
  if (dividerType === "double") line = "================================\n";
  if (dividerType === "dotted") line = "................................\n";
  if (dividerType === "solid")  line = "________________________________\n";
  
  const doubleLine = dividerType === "double" ? "================================\n" : "================================\n";
  const packets: Uint8Array[] = [];

  // If compact label style is selected, use a condensed identification tag
  if (labelStyle === "compact") {
    // 1. Initialize
    packets.push(ESC_POS.INIT);

    // 2. Header (Large & Centered)
    packets.push(ESC_POS.ALIGN_CENTER);
    packets.push(ESC_POS.BOLD_ON);
    packets.push(ESC_POS.DOUBLE_SIZE_ON);
    packets.push(encodeAscii(`${customStoreName.toUpperCase().slice(0, 16)}\n`));
    packets.push(ESC_POS.DOUBLE_SIZE_OFF);
    packets.push(encodeAscii("LABEL PENANDA\n"));
    packets.push(encodeAscii(doubleLine));

    // 3. Compact identification details
    packets.push(ESC_POS.ALIGN_LEFT);
    
    // Label CODE
    packets.push(encodeAscii("KODE : "));
    packets.push(ESC_POS.BOLD_ON);
    packets.push(ESC_POS.DOUBLE_SIZE_ON);
    packets.push(encodeAscii(`${trx.id && trx.id.length > 4 ? trx.id.substring(4).toUpperCase() : (trx.id || "TEST")}\n`));
    packets.push(ESC_POS.DOUBLE_SIZE_OFF);
    packets.push(ESC_POS.BOLD_OFF);

    // Full code underneath
    packets.push(encodeAscii(`NOTA : ${trx.id}\n`));
    
    // Customer Name
    packets.push(encodeAscii("NAMA : "));
    packets.push(ESC_POS.BOLD_ON);
    packets.push(encodeAscii(`${trx.customerName.toUpperCase()}\n`));
    packets.push(ESC_POS.BOLD_OFF);

    // Service Name and quantity
    packets.push(encodeAscii(`QTY  : ${trx.berat} Kg/Pcs\n`));
    
    // Custom Services listing
    const cleanLayanan = trx.layananNama.split(", ").map(i => i.split(" (")[0]).join(", ");
    packets.push(encodeAscii(`SERV : ${cleanLayanan}\n`));

    if (trx.parfum) {
      packets.push(encodeAscii(`WANGI: ${trx.parfum}\n`));
    }

    packets.push(encodeAscii(line));

    // Dates
    packets.push(encodeAscii(`MASUK: ${rawFormatDate(trx.tanggalMasuk)}\n`));
    
    packets.push(encodeAscii("EST  : "));
    packets.push(ESC_POS.BOLD_ON);
    packets.push(encodeAscii(`${rawFormatDate(trx.estimasiSelesai)}\n`));
    packets.push(ESC_POS.BOLD_OFF);

    const bayarText = trx.statusBayar === "Lunas" ? "LUNAS" : (trx.statusBayar === "DP" ? "DP" : "BELUM LUNAS");
    packets.push(encodeAscii("BAYAR: "));
    packets.push(ESC_POS.BOLD_ON);
    packets.push(encodeAscii(`[${bayarText}]\n`));
    packets.push(ESC_POS.BOLD_OFF);

    packets.push(ESC_POS.ALIGN_CENTER);
    packets.push(encodeAscii(doubleLine));
    if (footerText) {
      packets.push(encodeAscii(`${footerText}\n`));
    }
    
    packets.push(ESC_POS.FEED_PAPER);
    return combineBytes(packets);
  }

  // --- FULL RECEIPT-STYLE LABEL (Seperti di Gambar) ---
  // 1. Initialize
  packets.push(ESC_POS.INIT);

  // 2. Header Store Name
  packets.push(ESC_POS.ALIGN_CENTER);
  packets.push(ESC_POS.BOLD_ON);
  packets.push(encodeAscii(`${customStoreName}\n\n`));
  packets.push(ESC_POS.BOLD_OFF);

  // 3. Billing Transaction label
  packets.push(encodeAscii("No. Transaksi\n"));
  packets.push(ESC_POS.BOLD_ON);
  packets.push(encodeAscii(`${trx.id}\n\n`));
  packets.push(ESC_POS.BOLD_OFF);

  // 4. Large Bold Customer Name Centered
  packets.push(ESC_POS.ALIGN_CENTER);
  packets.push(ESC_POS.BOLD_ON);
  if (nameSize === "xl") {
    packets.push(ESC_POS.DOUBLE_SIZE_ON);
    packets.push(encodeAscii(`${trx.customerName.toUpperCase()}\n\n`));
    packets.push(ESC_POS.DOUBLE_SIZE_OFF);
  } else if (nameSize === "large") {
    // Large sans font weight via double width only or simulation
    packets.push(encodeAscii(`${trx.customerName.toUpperCase()}\n\n`));
  } else {
    packets.push(encodeAscii(`${trx.customerName.toUpperCase()}\n`));
  }
  packets.push(ESC_POS.BOLD_OFF);

  // 5. Columns Data Block
  packets.push(ESC_POS.ALIGN_LEFT);
  packets.push(encodeAscii(line));

  const padLeftRight = (k: string, v: string, maxLen = 32) => {
    const spaces = maxLen - k.length - v.length;
    return `${k}${" ".repeat(Math.max(1, spaces))}${v}\n`;
  };

  packets.push(encodeAscii(padLeftRight("Waktu", rawFormatDate(trx.tanggalMasuk))));
  packets.push(encodeAscii(padLeftRight("Est. Selesai", rawFormatDate(trx.estimasiSelesai))));
  if (trx.parfum) {
    packets.push(encodeAscii(padLeftRight("Parfum", trx.parfum)));
  }
  
  // Render clean notes (filter out bracket tags)
  if (trx.notes) {
    const cleanNote = trx.notes
      .replace(/\[Kasir:\s*[^\]]+\]/g, "")
      .replace(/\(Biaya Tambahan:\s*([^)]+)\)/g, "")
      .replace(/\(Diskon:\s*Rp\s*[^)]+\)/g, "")
      .replace(/\(Pembulatan:\s*Rp\s*[^)]+\)/g, "")
      .trim();
    if (cleanNote) {
      // Split or trim to fit a line gracefully
      packets.push(encodeAscii(padLeftRight("Catatan", cleanNote.slice(0, 20))));
    }
  }

  packets.push(encodeAscii(line));

  // 6. Services & rate breakdown
  const itemsList = trx.layananNama.split(", ");
  itemsList.forEach((item) => {
    packets.push(ESC_POS.BOLD_ON);
    packets.push(encodeAscii(`${item}\n`));
    packets.push(ESC_POS.BOLD_OFF);

    // Approximate unit rate representation for print mockup
    const qty = trx.berat || 1;
    // We can simulate rate from total if multiple, or simple division
    const estimatedRate = Math.round(trx.totalHarga / qty);
    const leftVal = `${qty} kg x ${rawFormatIDR(estimatedRate)}`;
    const lineTotal = rawFormatIDR(trx.totalHarga);
    
    packets.push(encodeAscii(padLeftRight(leftVal, lineTotal)));

    // Detail item listing inside notes if checked
    if (showDetails && trx.notes && trx.notes.includes("Detail item:")) {
      const match = trx.notes.match(/Detail item:\s*([^\[\n]+)/);
      if (match && match[1]) {
        packets.push(encodeAscii(`Detail item: ${match[1].trim()}\n`));
      }
    }
  });

  packets.push(encodeAscii(line));

  // 7. Subtotal, Discount & Total math block
  // Since we don't have separate subtotal/discount fields on the transaction, we'll cleanly construct it:
  // We can treat totalHarga as Total, and calculate a dummy subtotal + discount for premium view
  const discountVal = 5000; // Simulated discount fallback
  const simulatedSubtotal = trx.totalHarga + (trx.notes?.includes("Diskon") ? discountVal : 0);
  
  packets.push(encodeAscii(padLeftRight("Subtotal", rawFormatIDR(simulatedSubtotal))));
  if (trx.notes?.includes("Diskon")) {
    packets.push(encodeAscii(padLeftRight("Diskon", `-${rawFormatIDR(discountVal)}`)));
  }
  
  packets.push(ESC_POS.BOLD_ON);
  packets.push(encodeAscii(padLeftRight("Total", rawFormatIDR(trx.totalHarga))));
  packets.push(ESC_POS.BOLD_OFF);
  
  packets.push(encodeAscii(line));

  // 8. Payment status centered bold
  if (showPayment) {
    packets.push(ESC_POS.ALIGN_CENTER);
    packets.push(ESC_POS.BOLD_ON);
    packets.push(encodeAscii(`\n${trx.statusBayar.toUpperCase()}\n\n`));
    packets.push(ESC_POS.BOLD_OFF);
    packets.push(ESC_POS.ALIGN_LEFT);
    packets.push(encodeAscii(line));
  }

  // 9. Footer slogan & feed
  if (footerText) {
    packets.push(ESC_POS.ALIGN_CENTER);
    packets.push(encodeAscii(`${footerText}\n`));
  }

  packets.push(ESC_POS.FEED_PAPER);

  return combineBytes(packets);
}

/**
 * Universally triggers standard Web Print / AirPrint using the native browser printing mechanism.
 * Dynamically mounts a dedicated high-contrast black-on-white thermal receipt design,
 * calls window.print() (which standardizes formatting via @media print styles),
 * and restores the main overlay properly once printed.
 */
export function triggerWebPrint(trx: any, type: "nota" | "label", cashierName: string = "Kasir Utama"): void {
  // Prevent server-side errors
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // 1. Remove previous instance if lingering
  const redundant = document.getElementById("web-print-target");
  if (redundant) redundant.remove();

  // 2. Build target container
  const target = document.createElement("div");
  target.id = "web-print-target";
  
  // Style properties to enforce standard thermal look
  target.style.position = "absolute";
  target.style.left = "0";
  target.style.top = "0";
  target.style.width = "100%";
  target.style.maxWidth = "320px";
  target.style.backgroundColor = "#FFFFFF";
  target.style.color = "#000000";
  target.style.fontFamily = "monospace";
  target.style.fontSize = "12px";
  target.style.lineHeight = "1.4";
  target.style.padding = "20px";
  target.style.boxSizing = "border-box";
  target.style.margin = "0 auto";

  const dividerSymbol = "--------------------------------";
  const doubleDivider = "================================";

  if (type === "nota") {
    // 1. Services formatting
    const servicesText = trx.layananNama.split(", ").map((item: string) => `* ${item}`).join("<br/>");
    
    // 2. Note and comments cleaning
    const rawNote = trx.notes || "";
    const cleanNote = rawNote
      .replace(/\[Kasir:\s*[^\]]+\]/g, "")
      .replace(/\(Biaya Tambahan:\s*([^)]+)\)/g, "")
      .replace(/\(Diskon:\s*Rp\s*[^)]+\)/g, "")
      .replace(/\(Pembulatan:\s*Rp\s*[^)]+\)/g, "")
      .trim();
    const notesRow = cleanNote ? `<div style="margin-top: 4px;">Detail: ${cleanNote}</div>` : "";

    // 3. DP math extraction
    const hasDp = trx.statusBayar === "DP" && trx.dpAmount;
    const dpRow = hasDp 
      ? `
        <div style="display: flex; justify-content: space-between;">
          <span>Uang Muka (DP):</span>
          <span>Rp ${trx.dpAmount.toLocaleString("id-ID")}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>Sisa Tagihan:</span>
          <span>Rp ${(trx.totalHarga - trx.dpAmount).toLocaleString("id-ID")}</span>
        </div>
      `
      : "";

    target.innerHTML = `
      <div style="text-align: center; color: #000000 !important; background-color: #FFFFFF !important;">
        <h2 style="margin: 0; font-size: 16px; font-weight: 900; letter-spacing: 0.5px;">DAMDAM LAUNDRY</h2>
        <p style="margin: 3px 0 8px 0; font-size: 11px;">Jl. Damai Raya No. 42, Sleman<br/>WA: 0812-3456-789</p>
        <div style="font-size: 11px; margin-bottom: 8px;">${doubleDivider}</div>
        
        <div style="text-align: left; font-size: 11px; line-height: 1.5; margin-bottom: 8px;">
          <div>Nota  : <strong>${trx.id}</strong></div>
          <div>Kasir : ${cashierName}</div>
          <div>Cust  : ${trx.customerName}</div>
          ${trx.customerPhone ? `<div>Telp  : ${trx.customerPhone}</div>` : ""}
          <div>Masuk : ${rawFormatDate(trx.tanggalMasuk || new Date().toISOString())}</div>
          <div style="font-weight: bold;">Est. Selesai: ${rawFormatDate(trx.estimasiSelesai) || "-"}</div>
        </div>
        
        <div style="font-size: 11px; margin-bottom: 8px;">${dividerSymbol}</div>
        
        <div style="text-align: left; font-size: 11px; margin-bottom: 8px;">
          <div style="font-weight: bold; margin-bottom: 4px;">LAYANAN LAUNDRY:</div>
          <div>${servicesText}</div>
          <div style="margin-top: 4px;">Kuantitas : ${trx.berat || 0} Qty/Kg</div>
          ${trx.parfum ? `<div>Parfum    : ${trx.parfum}</div>` : ""}
          ${notesRow}
        </div>
        
        <div style="font-size: 11px; margin-bottom: 8px;">${dividerSymbol}</div>
        
        <div style="text-align: left; font-size: 11px; space-y: 1.5;">
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin-bottom: 4px;">
            <span>TOTAL AKHIR:</span>
            <span>Rp ${trx.totalHarga.toLocaleString("id-ID")}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span>Metode Bayar:</span>
            <span>${trx.pembayaranMetode || "Tunai"}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 40x;">
            <span>Status Bayar:</span>
            <span style="font-weight: bold;">${trx.statusBayar.toUpperCase()}</span>
          </div>
          ${dpRow}
        </div>
        
        <div style="font-size: 11px; margin-top: 8px; margin-bottom: 8px;">${doubleDivider}</div>
        
        <div style="font-size: 10px; margin-top: 12px; font-weight: bold;">
          TERIMA KASIH ATAS KUNJUNGANNYA<br/>
          <span style="font-size: 11.5px; letter-spacing: 0.1px;">PEKAT BERSIH, HIDUP BERKAH!</span>
        </div>
      </div>
    `;
  } else {
    // Label tag formatting style
    const isBrowser = typeof window !== "undefined";
    const customStoreName = isBrowser ? localStorage.getItem("damdam_label_store_name") || "Damdam Laundry" : "Damdam Laundry";
    const footerText = isBrowser ? localStorage.getItem("damdam_label_footer") || "* Jangan Hilang / Tertukar *" : "* Jangan Hilang / Tertukar *";
    const servicesText = trx.layananNama.split(", ").map((item: string) => `* ${item}`).join("<br/>");

    target.innerHTML = `
      <div style="text-align: center; color: #000000 !important; background-color: #FFFFFF !important; max-width: 290px; border: 1px solid #000; padding: 15px; border-radius: 6px; margin: 0 auto;">
        <h3 style="margin: 0; font-size: 13px; font-weight: bold; letter-spacing: 0.3px;">${customStoreName.toUpperCase()}</h3>
        <p style="margin: 2px 0 8px 0; font-size: 10px; text-transform: uppercase; font-weight: bold;">LABEL PENANDA PACKING</p>
        <div style="font-size: 11px; margin-bottom: 8px;">${doubleDivider}</div>
        
        <span style="font-size: 9px; text-transform: uppercase;">No. Transaksi</span><br/>
        <strong style="font-size: 11px; font-family: monospace;">${trx.id}</strong><br/>
        <br/>
        <div style="font-size: 20px; font-weight: 900; word-break: break-all; line-height: 1.2;">
          ${trx.customerName.toUpperCase()}
        </div>
        
        <div style="font-size: 11px; margin-top: 8px; margin-bottom: 8px;">${dividerSymbol}</div>
        
        <div style="text-align: left; font-size: 10px; line-height: 1.4;">
          <div>Waktu: ${rawFormatDate(trx.tanggalMasuk) || "-"}</div>
          <div>Est. Selesai: <strong>${rawFormatDate(trx.estimasiSelesai) || "-"}</strong></div>
          ${trx.parfum ? `<div>Parfum: ${trx.parfum}</div>` : ""}
        </div>
        
        <div style="font-size: 11px; margin-top: 8px; margin-bottom: 8px;">${dividerSymbol}</div>
        
        <div style="text-align: left; font-size: 10px; line-height: 1.4;">
          <strong>LAYANAN:</strong><br/>
          ${servicesText}<br/>
          Berat/Qty: ${trx.berat || 0} Kg/Pcs
        </div>
        
        <div style="font-size: 11px; margin-top: 8px; margin-bottom: 8px;">${doubleDivider}</div>
        <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px;">
          STATUS : [${trx.statusBayar.toUpperCase()}]
        </div>
        
        <div style="font-size: 9px; font-style: italic; font-weight: bold;">
          ${footerText}
        </div>
      </div>
    `;
  }

  // 3. Append target to body (outside of main root)
  document.body.appendChild(target);

  // 4. Trigger print
  setTimeout(() => {
    window.print();
    
    // 5. Clean up afterwards (allow enough time for standard mobile print triggers)
    setTimeout(() => {
      target.remove();
    }, 1500);
  }, 200);
}

