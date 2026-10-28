import { jsPDF } from "jspdf";
import { Karyawan, KasbonHistory, LocationConfig } from "../types";

export interface EnrichedKasbonHistory extends KasbonHistory {
  saldoSetelahnya: number;
}

// Format Rupiah helper
export function formatRupiah(val: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(val);
}

// Compute running balance from current balance for an employee's history
export function enrichKasbonHistory(
  rawList: KasbonHistory[],
  currentKasbon: number
): EnrichedKasbonHistory[] {
  let runningBalance = currentKasbon;
  return rawList.map((hist) => {
    const saldoSetelahnya = runningBalance;
    if (hist.tipe === "penambahan") {
      runningBalance = Math.max(0, runningBalance - hist.jumlah);
    } else {
      runningBalance = runningBalance + hist.jumlah;
    }
    return { ...hist, saldoSetelahnya };
  });
}

/**
 * Generate and download single employee Kasbon History PDF
 */
export function exportKasbonSinglePDF({
  karyawan,
  historyList,
  currentKasbon,
  outletName = "Clean & Fresh Laundry"
}: {
  karyawan: Karyawan;
  historyList: EnrichedKasbonHistory[];
  currentKasbon: number;
  outletName?: string;
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm

  // Summary figures
  const totalPinjaman = historyList
    .filter((h) => h.tipe === "penambahan")
    .reduce((sum, h) => sum + (h.jumlah || 0), 0);

  const totalPotongan = historyList
    .filter((h) => h.tipe === "pengurangan")
    .reduce((sum, h) => sum + (h.jumlah || 0), 0);

  // Hitung Saldo Awal (sebelum seluruh mutasi tercatat)
  const saldoAwal = Math.max(0, currentKasbon - totalPinjaman + totalPotongan);

  const printDateStr = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const printTimeStr = new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });

  // Top header styling
  doc.setFillColor(18, 18, 20); // Dark sleek accent header bar
  doc.rect(marginX, 12, contentWidth, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("BUKTI & RIWAYAT KASBON KARYAWAN", marginX + 6, 21);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(212, 212, 216);
  doc.text(`${outletName.toUpperCase()} • SISTEM PENGGAJIAN & KASBON RESMI`, marginX + 6, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(250, 204, 21); // yellow/amber tag
  doc.text("DOKUMEN SAH", marginX + contentWidth - 6, 21, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(161, 161, 170);
  doc.text(`Dicetak: ${printDateStr} ${printTimeStr} WIB`, marginX + contentWidth - 6, 28, { align: "right" });

  // Employee Profile Card
  let currentY = 40;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, currentY, contentWidth, 24, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("PROFIL KARYAWAN", marginX + 5, currentY + 6);
  doc.text("DETAIL PENUGASAN", marginX + 95, currentY + 6);

  // Left col: Nama & ID
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text("Nama Karyawan", marginX + 5, currentY + 13);
  doc.text("ID Karyawan", marginX + 5, currentY + 19);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`:  ${karyawan.nama}`, marginX + 35, currentY + 13);
  doc.text(`:  ${karyawan.id}`, marginX + 35, currentY + 19);

  // Right col: WhatsApp & Shift
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.text("No. WhatsApp", marginX + 95, currentY + 13);
  doc.text("Shift / Status", marginX + 95, currentY + 19);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`:  ${karyawan.telepon || "-"}`, marginX + 125, currentY + 13);
  const shiftLabel = karyawan.currentShift === "tidak_ada" ? "Tidak Ada Shift (Libur)" : (karyawan.currentShift === "siang" ? "Shift Siang" : "Shift Pagi");
  doc.text(`:  ${shiftLabel} (Aktif)`, marginX + 125, currentY + 19);

  // 2 Metric Summary Boxes (Total Pinjaman & Sisa Kasbon Aktif)
  currentY = 68;
  const gap = 6;
  const boxWidth = (contentWidth - gap) / 2; // 2 spacious boxes

  // Box 1: Total Pinjaman (Biru)
  doc.setFillColor(239, 246, 255); // light blue
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(marginX, currentY, boxWidth, 18, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(29, 78, 216); // blue-700
  doc.text("TOTAL PINJAMAN", marginX + 4, currentY + 5.5);
  doc.setFontSize(11);
  doc.setTextColor(29, 78, 216);
  doc.text(formatRupiah(totalPinjaman), marginX + 4, currentY + 13.5);

  // Box 2: Saldo Kasbon Aktif (Amber)
  doc.setFillColor(254, 243, 199); // light amber
  doc.setDrawColor(253, 230, 138);
  doc.roundedRect(marginX + boxWidth + gap, currentY, boxWidth, 18, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(146, 64, 14); // amber-800
  doc.text("SALDO KASBON AKTIF", marginX + boxWidth + gap + 4, currentY + 5.5);
  doc.setFontSize(11);
  doc.setTextColor(146, 64, 14);
  doc.text(formatRupiah(currentKasbon), marginX + boxWidth + gap + 4, currentY + 13.5);

  // Table Title
  currentY = 92;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`RINCIAN MUTASI & TRANSAKSI KASBON (${historyList.length} Transaksi)`, marginX, currentY);

  // Function to draw table header (without Keterangan column)
  const drawTableHeader = (yPos: number) => {
    doc.setFillColor(228, 232, 240); // neutral zinc/slate
    doc.rect(marginX, yPos, contentWidth, 7.5, "F");
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, yPos + 7.5, marginX + contentWidth, yPos + 7.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);

    // Columns: No, Tanggal, Jenis Transaksi, Nominal (IDR), Saldo Kasbon Setelahnya
    doc.text("NO", marginX + 4, yPos + 5);
    doc.text("TANGGAL", marginX + 18, yPos + 5);
    doc.text("JENIS TRANSAKSI", marginX + 62, yPos + 5);
    doc.text("NOMINAL (IDR)", marginX + 125, yPos + 5, { align: "right" });
    doc.text("SALDO SETELAHNYA", marginX + contentWidth - 4, yPos + 5, { align: "right" });
  };

  currentY += 3;
  drawTableHeader(currentY);
  currentY += 7.5;

  if (historyList.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Belum ada riwayat mutasi kasbon untuk karyawan ini.", marginX + 5, currentY + 8);
    currentY += 16;
  } else {
    historyList.forEach((item, index) => {
      // Check page break
      if (currentY > pageHeight - 65) {
        doc.addPage();
        currentY = 16;
        drawTableHeader(currentY);
        currentY += 7.5;
      }

      const isAdd = item.tipe === "penambahan";
      const isEven = index % 2 === 0;

      // Row background
      if (isEven) {
        doc.setFillColor(250, 250, 250);
        doc.rect(marginX, currentY, contentWidth, 8.5, "F");
      }

      doc.setDrawColor(241, 245, 249);
      doc.line(marginX, currentY + 8.5, marginX + contentWidth, currentY + 8.5);

      // No
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(String(index + 1), marginX + 4, currentY + 5.5);

      // Tanggal
      doc.setTextColor(30, 41, 59);
      doc.text(item.tanggal || "-", marginX + 18, currentY + 5.5);

      // Jenis Transaksi Badge (Biru untuk penambahan, Merah untuk potongan)
      if (isAdd) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(29, 78, 216); // Biru (Blue)
        doc.text("Penambahan Kasbon (+)", marginX + 62, currentY + 5.5);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(185, 28, 28); // Merah (Red)
        doc.text("Potong / Pelunasan (-)", marginX + 62, currentY + 5.5);
      }

      // Nominal (Biru untuk penambahan, Merah untuk potongan)
      doc.setFont("helvetica", "bold");
      if (isAdd) {
        doc.setTextColor(29, 78, 216); // Biru (Blue)
        doc.text(`+ ${formatRupiah(item.jumlah)}`, marginX + 125, currentY + 5.5, { align: "right" });
      } else {
        doc.setTextColor(185, 28, 28); // Merah (Red)
        doc.text(`- ${formatRupiah(item.jumlah)}`, marginX + 125, currentY + 5.5, { align: "right" });
      }

      // Saldo Setelahnya
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(formatRupiah(item.saldoSetelahnya), marginX + contentWidth - 4, currentY + 5.5, { align: "right" });

      currentY += 8.5;
    });

    // If there is a saldo awal, append as a clean transaction row at the bottom matching user format
    if (saldoAwal > 0) {
      if (currentY > pageHeight - 45) {
        doc.addPage();
        currentY = 16;
        drawTableHeader(currentY);
        currentY += 7.5;
      }

      const nextNo = historyList.length + 1;
      const isEven = historyList.length % 2 === 0;

      if (isEven) {
        doc.setFillColor(250, 250, 250);
        doc.rect(marginX, currentY, contentWidth, 8.5, "F");
      }

      doc.setDrawColor(241, 245, 249);
      doc.line(marginX, currentY + 8.5, marginX + contentWidth, currentY + 8.5);

      // No
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(String(nextNo), marginX + 4, currentY + 5.5);

      // Tanggal: Saldo Awal
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text("Saldo Awal", marginX + 18, currentY + 5.5);

      // Jenis Transaksi: Pemberian Awal Kasbon (Biru)
      doc.setTextColor(29, 78, 216); // Biru (Blue)
      doc.text("Pemberian Awal Kasbon", marginX + 62, currentY + 5.5);

      // Nominal: + Rp 350.000 (Biru)
      doc.text(`+ ${formatRupiah(saldoAwal)}`, marginX + 125, currentY + 5.5, { align: "right" });

      // Saldo Setelahnya: Rp 350.000
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(formatRupiah(saldoAwal), marginX + contentWidth - 4, currentY + 5.5, { align: "right" });

      currentY += 8.5;
    }
  }

  // Check if we need a new page for signatures
  if (currentY > pageHeight - 45) {
    doc.addPage();
    currentY = 20;
  } else {
    currentY += 6;
  }

  // Signature Block
  doc.setDrawColor(226, 232, 240);
  doc.line(marginX, currentY, marginX + contentWidth, currentY);
  currentY += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Catatan: Riwayat kasbon ini sinkron real-time dengan mutasi pembukuan dan slip gaji karyawan.", marginX, currentY);

  currentY += 8;
  const sigColWidth = contentWidth / 2;

  // Left signature: Karyawan
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text("Karyawan Bersangkutan,", marginX + 15, currentY);
  doc.setFont("helvetica", "bold");
  doc.text(`( ${karyawan.nama} )`, marginX + 15, currentY + 18);

  // Right signature: Owner / Manajemen
  doc.setFont("helvetica", "normal");
  doc.text("Owner / Manajemen Laundry,", marginX + sigColWidth + 15, currentY);
  doc.setFont("helvetica", "bold");
  doc.text(`( Manajemen ${outletName} )`, marginX + sigColWidth + 15, currentY + 18);

  // Page Numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Halaman ${i} dari ${totalPages} • Dokumen Sistem Kasbon ${outletName}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  // Sanitize filename
  const cleanName = karyawan.nama.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ymd = new Date().toISOString().substring(0, 10);
  doc.save(`Riwayat_Kasbon_${cleanName}_${ymd}.pdf`);
}

/**
 * Generate and download single employee Kasbon History CSV / Excel
 */
export function exportKasbonSingleCSV({
  karyawan,
  historyList,
  currentKasbon,
  outletName = "Clean & Fresh Laundry"
}: {
  karyawan: Karyawan;
  historyList: EnrichedKasbonHistory[];
  currentKasbon: number;
  outletName?: string;
}) {
  const totalPinjaman = historyList
    .filter((h) => h.tipe === "penambahan")
    .reduce((sum, h) => sum + (h.jumlah || 0), 0);

  const totalPotongan = historyList
    .filter((h) => h.tipe === "pengurangan")
    .reduce((sum, h) => sum + (h.jumlah || 0), 0);

  const saldoAwal = Math.max(0, currentKasbon - totalPinjaman + totalPotongan);

  const printDateStr = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const lines: string[] = [];

  // Header metadata
  lines.push(`"LAPORAN RIWAYAT & MUTASI KASBON KARYAWAN"`);
  lines.push(`"Outlet","${outletName}"`);
  lines.push(`"Nama Karyawan","${karyawan.nama}"`);
  lines.push(`"ID Karyawan","${karyawan.id}"`);
  lines.push(`"Nomor Telepon/WA","${karyawan.telepon || "-"}"`);
  const shiftCsv = karyawan.currentShift === "tidak_ada" ? "Tidak Ada Shift (Libur)" : (karyawan.currentShift === "siang" ? "Shift Siang" : "Shift Pagi");
  lines.push(`"Shift Penugasan","${shiftCsv}"`);
  lines.push(`"Tanggal Unduh","${printDateStr}"`);
  lines.push("");
  lines.push(`"RINGKASAN SALDO KASBON"`);
  lines.push(`"Saldo Awal Kasbon (IDR)",${saldoAwal}`);
  lines.push(`"Total Kasbon Diberikan / Pinjaman (IDR)",${totalPinjaman}`);
  lines.push(`"Total Pemotongan / Pelunasan (IDR)",${totalPotongan}`);
  lines.push(`"Sisa Saldo Kasbon Aktif (IDR)",${currentKasbon}`);
  lines.push("");

  // Table header
  lines.push(`"No","Tanggal","ID Transaksi","Tipe Transaksi","Nominal (IDR)","Saldo Setelahnya (IDR)","Keterangan"`);

  // Data rows
  historyList.forEach((item, index) => {
    const isAdd = item.tipe === "penambahan";
    const tipeText = isAdd ? "Pemberian Kasbon (+)" : "Pemotongan / Pelunasan (-)";
    const cleanKet = (item.keterangan || "-").replace(/"/g, '""');
    lines.push(
      `${index + 1},"${item.tanggal || "-"}","${item.id}","${tipeText}",${item.jumlah},${item.saldoSetelahnya},"${cleanKet}"`
    );
  });

  // UTF-8 BOM for Microsoft Excel compatibility
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  const cleanName = karyawan.nama.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ymd = new Date().toISOString().substring(0, 10);
  link.href = url;
  link.setAttribute("download", `Riwayat_Kasbon_${cleanName}_${ymd}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate and download ALL employees Kasbon Summary PDF
 */
export function exportKasbonAllEmployeesPDF({
  karyawanList,
  allKasbonHistory,
  outletName = "Clean & Fresh Laundry"
}: {
  karyawanList: Karyawan[];
  allKasbonHistory: KasbonHistory[];
  outletName?: string;
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  const totalOutstandingKasbon = karyawanList.reduce((acc, k) => acc + (k.kasbon || 0), 0);
  const totalEmployeesWithKasbon = karyawanList.filter((k) => (k.kasbon || 0) > 0).length;

  const printDateStr = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  // Top header banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(marginX, 12, contentWidth, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("REKAPITULASI MASTER KASBON KARYAWAN", marginX + 6, 21);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`${outletName.toUpperCase()} • KONSOLIDASI SELURUH STAF & MUTASI`, marginX + 6, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(250, 204, 21);
  doc.text("LAPORAN MANAJEMEN", marginX + contentWidth - 6, 21, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Per Tanggal: ${printDateStr}`, marginX + contentWidth - 6, 28, { align: "right" });

  // Summary Metrics
  let currentY = 39;
  const boxWidth = (contentWidth - 6) / 3;

  // Box 1: Total Sisa Kasbon Berjalan
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(253, 230, 138);
  doc.roundedRect(marginX, currentY, boxWidth, 18, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(146, 64, 14);
  doc.text("TOTAL KASBON AKTIF OUTLET", marginX + 4, currentY + 5.5);
  doc.setFontSize(11.5);
  doc.text(formatRupiah(totalOutstandingKasbon), marginX + 4, currentY + 13.5);

  // Box 2: Karyawan Memiliki Kasbon
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginX + boxWidth + 3, currentY, boxWidth, 18, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text("STAF MEMILIKI KASBON", marginX + boxWidth + 7, currentY + 5.5);
  doc.setFontSize(11.5);
  doc.text(`${totalEmployeesWithKasbon} dari ${karyawanList.length} Staf`, marginX + boxWidth + 7, currentY + 13.5);

  // Box 3: Total Mutasi Transaksi
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(marginX + (boxWidth + 3) * 2, currentY, boxWidth, 18, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(22, 101, 52);
  doc.text("TOTAL LOG MUTASI TERCATAT", marginX + (boxWidth + 3) * 2 + 4, currentY + 5.5);
  doc.setFontSize(11.5);
  doc.text(`${allKasbonHistory.length} Transaksi`, marginX + (boxWidth + 3) * 2 + 4, currentY + 13.5);

  // Section 1: Saldo Kasbon Per Karyawan
  currentY = 63;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text("1. TABEL SALDO KASBON AKTIF PER KARYAWAN", marginX, currentY);

  currentY += 4;
  doc.setFillColor(226, 232, 240);
  doc.rect(marginX, currentY, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text("NO", marginX + 3, currentY + 4.8);
  doc.text("NAMA KARYAWAN", marginX + 12, currentY + 4.8);
  doc.text("NO. WHATSAPP", marginX + 60, currentY + 4.8);
  doc.text("SHIFT", marginX + 100, currentY + 4.8);
  doc.text("TOTAL TRANSAKSI", marginX + 140, currentY + 4.8, { align: "right" });
  doc.text("SALDO KASBON SAAT INI", marginX + contentWidth - 3, currentY + 4.8, { align: "right" });

  currentY += 7;

  karyawanList.forEach((k, idx) => {
    const kHistCount = allKasbonHistory.filter((h) => h.karyawanId === k.id).length;
    const isEven = idx % 2 === 0;

    if (isEven) {
      doc.setFillColor(250, 250, 250);
      doc.rect(marginX, currentY, contentWidth, 7, "F");
    }

    doc.setDrawColor(241, 245, 249);
    doc.line(marginX, currentY + 7, marginX + contentWidth, currentY + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(String(idx + 1), marginX + 3, currentY + 4.8);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(k.nama, marginX + 12, currentY + 4.8);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(k.telepon || "-", marginX + 60, currentY + 4.8);
    const rowShift = k.currentShift === "tidak_ada" ? "Off" : (k.currentShift === "siang" ? "Siang" : "Pagi");
    doc.text(rowShift, marginX + 100, currentY + 4.8);
    doc.text(`${kHistCount} log`, marginX + 140, currentY + 4.8, { align: "right" });

    doc.setFont("helvetica", "bold");
    if ((k.kasbon || 0) > 0) {
      doc.setTextColor(217, 119, 6); // amber
    } else {
      doc.setTextColor(22, 101, 52); // green
    }
    doc.text(formatRupiah(k.kasbon || 0), marginX + contentWidth - 3, currentY + 4.8, { align: "right" });

    currentY += 7;
  });

  // Section 2: Riwayat Transaksi Kasbon Terbaru
  currentY += 6;
  if (currentY > pageHeight - 65) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`2. LOG RIWAYAT MUTASI KASBON TERBARU (${allKasbonHistory.length} Total)`, marginX, currentY);

  currentY += 4;
  const drawSubLogHeader = (yPos: number) => {
    doc.setFillColor(226, 232, 240);
    doc.rect(marginX, yPos, contentWidth, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text("NO", marginX + 3, yPos + 4.8);
    doc.text("TANGGAL", marginX + 11, yPos + 4.8);
    doc.text("NAMA STAF", marginX + 34, yPos + 4.8);
    doc.text("TIPE MUTASI", marginX + 75, yPos + 4.8);
    doc.text("NOMINAL", marginX + 120, yPos + 4.8, { align: "right" });
    doc.text("KETERANGAN", marginX + 126, yPos + 4.8);
  };

  drawSubLogHeader(currentY);
  currentY += 7;

  allKasbonHistory.forEach((hist, index) => {
    if (currentY > pageHeight - 35) {
      doc.addPage();
      currentY = 16;
      drawSubLogHeader(currentY);
      currentY += 7;
    }

    const isAdd = hist.tipe === "penambahan";
    const isEven = index % 2 === 0;

    if (isEven) {
      doc.setFillColor(250, 250, 250);
      doc.rect(marginX, currentY, contentWidth, 7, "F");
    }

    doc.setDrawColor(241, 245, 249);
    doc.line(marginX, currentY + 7, marginX + contentWidth, currentY + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(String(index + 1), marginX + 3, currentY + 4.8);

    doc.setTextColor(30, 41, 59);
    doc.text(hist.tanggal || "-", marginX + 11, currentY + 4.8);

    doc.setFont("helvetica", "bold");
    doc.text(hist.karyawanNama || "-", marginX + 34, currentY + 4.8);

    doc.setFont("helvetica", "bold");
    if (isAdd) {
      doc.setTextColor(29, 78, 216); // Biru (Blue)
      doc.text("Pinjaman (+)", marginX + 75, currentY + 4.8);
      doc.text(`+ ${formatRupiah(hist.jumlah)}`, marginX + 120, currentY + 4.8, { align: "right" });
    } else {
      doc.setTextColor(185, 28, 28); // Merah (Red)
      doc.text("Potongan (-)", marginX + 75, currentY + 4.8);
      doc.text(`- ${formatRupiah(hist.jumlah)}`, marginX + 120, currentY + 4.8, { align: "right" });
    }

    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    const cleanKet = hist.keterangan ? hist.keterangan.replace(/[\n\r]+/g, " ") : "-";
    const shortKet = cleanKet.length > 34 ? cleanKet.substring(0, 32) + "..." : cleanKet;
    doc.text(shortKet, marginX + 126, currentY + 4.8);

    currentY += 7;
  });

  // Page Numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Halaman ${i} dari ${totalPages} • Rekap Master Kasbon ${outletName}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  const ymd = new Date().toISOString().substring(0, 10);
  doc.save(`Rekap_Master_Kasbon_Semua_Karyawan_${ymd}.pdf`);
}

/**
 * Generate and download ALL employees Kasbon Summary CSV
 */
export function exportKasbonAllEmployeesCSV({
  karyawanList,
  allKasbonHistory,
  outletName = "Clean & Fresh Laundry"
}: {
  karyawanList: Karyawan[];
  allKasbonHistory: KasbonHistory[];
  outletName?: string;
}) {
  const totalOutstandingKasbon = karyawanList.reduce((acc, k) => acc + (k.kasbon || 0), 0);
  const printDateStr = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const lines: string[] = [];

  lines.push(`"REKAPITULASI MASTER KASBON KARYAWAN"`);
  lines.push(`"Outlet","${outletName}"`);
  lines.push(`"Tanggal Unduh","${printDateStr}"`);
  lines.push(`"Total Saldo Kasbon Aktif (IDR)",${totalOutstandingKasbon}`);
  lines.push(`"Total Jumlah Karyawan",${karyawanList.length}`);
  lines.push("");

  lines.push(`"=== TABEL SALDO KASBON PER KARYAWAN ==="`);
  lines.push(`"No","Nama Karyawan","ID Karyawan","No Telepon","Shift","Saldo Kasbon Aktif (IDR)"`);
  karyawanList.forEach((k, idx) => {
    const shiftCsvRow = k.currentShift === "tidak_ada" ? "Off" : (k.currentShift === "siang" ? "Siang" : "Pagi");
    lines.push(
      `${idx + 1},"${k.nama}","${k.id}","${k.telepon || "-"}","${shiftCsvRow}",${k.kasbon || 0}`
    );
  });

  lines.push("");
  lines.push(`"=== LOG RIWAYAT MUTASI KASBON LENGKAP ==="`);
  lines.push(`"No","Tanggal","ID Transaksi","Nama Karyawan","ID Karyawan","Tipe Transaksi","Nominal (IDR)","Keterangan"`);

  allKasbonHistory.forEach((hist, idx) => {
    const isAdd = hist.tipe === "penambahan";
    const tipeText = isAdd ? "Pemberian Kasbon (+)" : "Pemotongan / Pelunasan (-)";
    const cleanKet = (hist.keterangan || "-").replace(/"/g, '""');
    lines.push(
      `${idx + 1},"${hist.tanggal || "-"}","${hist.id}","${hist.karyawanNama}","${hist.karyawanId}","${tipeText}",${hist.jumlah},"${cleanKet}"`
    );
  });

  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  const ymd = new Date().toISOString().substring(0, 10);
  link.href = url;
  link.setAttribute("download", `Rekap_Master_Kasbon_Semua_Karyawan_${ymd}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
