/* Barcode Generator
 * Fitur:
 * - Mode Tunggal: satu teks/angka, bisa diatur jumlahnya
 * - Mode Tabel: form tabel editable (tambah/hapus baris), tiap baris satu barcode
 * - Mode Batch/CSV: tiap baris (atau baris CSV) menjadi barcode berbeda
 * - Format: CODE128, EAN-13, EAN-8, UPC, CODE39, ITF-14, MSI, dll
 * - Pengaturan kertas (A4/Letter/Legal/A5, orientasi, kolom per baris) untuk PDF
 * - Download PNG per barcode
 * - Export ke PDF dan Excel (XLSX dengan gambar barcode)
 * Library: JsBarcode (render), jsPDF (PDF), ExcelJS (Excel)
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    form: $("qr-form"),
    content: $("content"),
    batchContent: $("batch-content"),
    csvFile: $("csv-file"),
    label: $("label"),
    format: $("format"),
    quantity: $("quantity"),
    barWidth: $("barWidth"),
    barHeight: $("barHeight"),
    displayValue: $("displayValue"),
    numbered: $("numbered"),
    paperSize: $("paperSize"),
    orientation: $("orientation"),
    columns: $("columns"),
    generateBtn: $("generate-btn"),
    exportPdfBtn: $("export-pdf-btn"),
    exportXlsxBtn: $("export-xlsx-btn"),
    clearBtn: $("clear-btn"),
    addRow: $("add-row"),
    tbody: $("data-tbody"),
    grid: $("qr-grid"),
    countBadge: $("count-badge"),
    statusText: $("status-text"),
    modeTabs: document.querySelectorAll(".mode-tab"),
    modeSingle: document.querySelectorAll(".mode-single"),
    modeTable: document.querySelector(".mode-table"),
    modeBatch: document.querySelector(".mode-batch"),
  };

  // State
  let generated = [];
  let mode = "single";
  let debounceTimer = null;

  /* ---------- Utilities ---------- */

  function clampNum(value, min, max, fallback) {
    const n = parseFloat(value);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function setStatus(text) { els.statusText.textContent = text; }

  function showPlaceholder() {
    els.grid.classList.add("empty");
    els.grid.innerHTML =
      '<div class="placeholder"><div class="placeholder-icon">|||</div>' +
      "<p>Masukkan teks atau angka untuk melihat barcode di sini.</p></div>";
    els.countBadge.textContent = "0";
    els.exportPdfBtn.disabled = true;
    els.exportXlsxBtn.disabled = true;
  }

  function safeFileName(str, fallback) {
    const clean = (str || "").replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
    return (clean || fallback).slice(0, 40);
  }

  function timestamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  }

  /* ---------- Tabel input (mode Tabel) ---------- */

  function addTableRow(data, label) {
    const tr = document.createElement("tr");

    const tdNo = document.createElement("td");
    tdNo.className = "col-no";
    tr.appendChild(tdNo);

    const tdData = document.createElement("td");
    const inData = document.createElement("input");
    inData.type = "text";
    inData.className = "row-data";
    inData.placeholder = "mis. 5901234123457";
    inData.value = data || "";
    inData.addEventListener("input", debouncedGenerate);
    tdData.appendChild(inData);
    tr.appendChild(tdData);

    const tdLabel = document.createElement("td");
    const inLabel = document.createElement("input");
    inLabel.type = "text";
    inLabel.className = "row-label";
    inLabel.placeholder = "opsional";
    inLabel.value = label || "";
    inLabel.addEventListener("input", debouncedGenerate);
    tdLabel.appendChild(inLabel);
    tr.appendChild(tdLabel);

    const tdAct = document.createElement("td");
    tdAct.className = "col-act";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "row-del";
    del.textContent = "\u00D7";
    del.title = "Hapus baris";
    del.addEventListener("click", () => {
      tr.remove();
      renumberRows();
      generate();
    });
    tdAct.appendChild(del);
    tr.appendChild(tdAct);

    els.tbody.appendChild(tr);
    renumberRows();
  }

  function renumberRows() {
    Array.from(els.tbody.children).forEach((tr, i) => {
      tr.querySelector(".col-no").textContent = String(i + 1);
    });
  }

  function getTableItems() {
    const items = [];
    Array.from(els.tbody.children).forEach((tr) => {
      const data = tr.querySelector(".row-data").value.trim();
      const label = tr.querySelector(".row-label").value.trim();
      if (data) items.push({ content: data, label });
    });
    return items;
  }

  /* ---------- Parsing daftar (batch) ---------- */

  function parseLine(line) {
    let content = line, label = "";
    if (line.includes("|")) {
      const p = line.split("|");
      content = p[0].trim();
      label = p.slice(1).join("|").trim();
    } else if (line.includes(",")) {
      const p = line.split(",");
      content = p[0].trim();
      label = p.slice(1).join(",").trim();
    }
    return { content: content.trim(), label };
  }

  function buildItems() {
    const numbered = els.numbered.value === "yes";
    let items = [];

    if (mode === "single") {
      const content = els.content.value.trim();
      if (content) {
        const label = els.label.value.trim();
        const quantity = clampNum(els.quantity.value, 1, 500, 1);
        els.quantity.value = quantity;
        for (let i = 0; i < quantity; i++) items.push({ content, label });
      }
    } else if (mode === "table") {
      items = getTableItems();
    } else {
      const lines = els.batchContent.value
        .split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      lines.forEach((line) => {
        const { content, label } = parseLine(line);
        if (content) items.push({ content, label });
      });
    }

    return items.map((it, idx) => ({
      content: it.content,
      caption: it.label || it.content,
      label: it.label,
      index: idx + 1,
      showIndex: numbered,
    }));
  }

  /* ---------- Generate barcode ---------- */

  function makeBarcode(content, opts) {
    const canvas = document.createElement("canvas");
    try {
      JsBarcode(canvas, content, {
        format: opts.format,
        width: opts.barWidth,
        height: opts.barHeight,
        displayValue: opts.displayValue,
        margin: 10,
        background: "#ffffff",
        lineColor: "#0f172a",
        fontSize: 16,
        valid: function (valid) {
          if (!valid) throw new Error("Nilai tidak valid untuk format " + opts.format);
        },
      });
      return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
    } catch (err) {
      return { error: err.message || String(err) };
    }
  }

  function generate() {
    const opts = {
      format: els.format.value,
      barWidth: clampNum(els.barWidth.value, 1, 6, 2),
      barHeight: clampNum(els.barHeight.value, 20, 300, 100),
      displayValue: els.displayValue.value === "yes",
    };
    els.barWidth.value = opts.barWidth;
    els.barHeight.value = opts.barHeight;

    const items = buildItems();

    if (!items.length) {
      generated = [];
      showPlaceholder();
      setStatus("Belum ada barcode.");
      return;
    }

    generated = [];
    let errorCount = 0, lastError = "";

    items.forEach((it) => {
      const r = makeBarcode(it.content, opts);
      if (r.error) {
        errorCount++;
        lastError = r.error;
        generated.push({ error: r.error, content: it.content, caption: it.caption, label: it.label, index: it.index, showIndex: it.showIndex });
      } else {
        generated.push({
          dataUrl: r.dataUrl, width: r.width, height: r.height, ratio: r.height / r.width,
          content: it.content, caption: it.caption, label: it.label, index: it.index, showIndex: it.showIndex,
        });
      }
    });

    renderGrid();
    const okCount = generated.length - errorCount;
    els.exportPdfBtn.disabled = okCount === 0;
    els.exportXlsxBtn.disabled = okCount === 0;

    if (errorCount === 0) setStatus(okCount + " barcode dibuat.");
    else if (okCount === 0) setStatus("Gagal: " + lastError);
    else setStatus(okCount + " barcode dibuat, " + errorCount + " gagal (format tidak cocok).");
  }

  /* ---------- Render ---------- */

  function renderGrid() {
    els.grid.classList.remove("empty");
    els.grid.innerHTML = "";
    els.countBadge.textContent = String(generated.length);

    const frag = document.createDocumentFragment();
    generated.forEach((item) => {
      const card = document.createElement("div");
      card.className = "qr-card";

      if (item.error) {
        const errBox = document.createElement("div");
        errBox.className = "barcode-error";
        errBox.textContent = "\u26A0 " + item.error;
        card.appendChild(errBox);
      } else {
        const img = document.createElement("img");
        img.src = item.dataUrl;
        img.alt = "barcode";
        card.appendChild(img);
      }

      const cap = document.createElement("div");
      cap.className = "qr-caption";
      cap.textContent = item.caption;
      card.appendChild(cap);

      if (item.showIndex) {
        const idx = document.createElement("div");
        idx.className = "qr-index";
        idx.textContent = "#" + item.index;
        card.appendChild(idx);
      }

      if (!item.error) {
        const dl = document.createElement("button");
        dl.type = "button";
        dl.className = "qr-dl";
        dl.textContent = "\u2B07 Download PNG";
        dl.addEventListener("click", () => downloadPng(item));
        card.appendChild(dl);
      }

      frag.appendChild(card);
    });
    els.grid.appendChild(frag);
  }

  /* ---------- Download PNG per barcode ---------- */

  function downloadPng(item) {
    const a = document.createElement("a");
    a.href = item.dataUrl;
    a.download = "barcode-" + safeFileName(item.caption, "code") + "-" + item.index + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ---------- Export PDF (mengikuti pengaturan kertas) ---------- */

  function exportPdf() {
    const valid = generated.filter((g) => !g.error);
    if (!valid.length) return;
    setStatus("Menyiapkan PDF...");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      unit: "mm",
      format: els.paperSize.value,
      orientation: els.orientation.value,
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;
    const cols = clampNum(els.columns.value, 1, 8, 3);
    els.columns.value = cols;
    const gap = 6;
    const captionH = 7;

    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;

    let i = 0;
    valid.forEach((item) => {
      const ratio = item.ratio || 0.45;
      const imgW = cellW;
      const imgH = imgW * ratio;
      const rowH = imgH + captionH + gap;
      const rowsPerPage = Math.max(1, Math.floor((pageH - margin * 2) / rowH));
      const perPage = cols * rowsPerPage;

      const posInPage = i % perPage;
      if (i > 0 && posInPage === 0) doc.addPage();

      const col = posInPage % cols;
      const row = Math.floor(posInPage / cols);
      const x = margin + col * (cellW + gap);
      const y = margin + row * rowH;

      doc.addImage(item.dataUrl, "PNG", x, y, imgW, imgH);

      doc.setFontSize(8);
      doc.setTextColor(40);
      let caption = item.caption || "";
      if (item.showIndex) caption = "#" + item.index + "  " + caption;
      const maxChars = Math.floor(cellW / 1.6);
      if (caption.length > maxChars) caption = caption.slice(0, maxChars - 1) + "\u2026";
      doc.text(caption, x + imgW / 2, y + imgH + 4, { align: "center" });
      i++;
    });

    doc.save("barcodes-" + timestamp() + ".pdf");
    setStatus(valid.length + " barcode di-export ke PDF (" + els.paperSize.value.toUpperCase() + ").");
  }

  /* ---------- Export Excel (XLSX dengan gambar) ---------- */

  async function exportXlsx() {
    const valid = generated.filter((g) => !g.error);
    if (!valid.length) return;
    if (typeof ExcelJS === "undefined") {
      setStatus("Library Excel belum termuat. Periksa koneksi internet.");
      return;
    }
    setStatus("Menyiapkan Excel...");

    const wb = new ExcelJS.Workbook();
    wb.creator = "Barcode Generator";
    const ws = wb.addWorksheet("Barcodes");

    ws.columns = [
      { header: "No", key: "no", width: 6 },
      { header: "Data", key: "data", width: 24 },
      { header: "Label", key: "label", width: 24 },
      { header: "Barcode", key: "barcode", width: 34 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle" };

    const DISPLAY_W = 200; // lebar gambar di Excel (px)

    valid.forEach((item, i) => {
      const excelRow = i + 2; // baris 1 = header
      ws.addRow({ no: item.index, data: item.content, label: item.label || "" });

      const displayW = DISPLAY_W;
      const displayH = displayW * (item.ratio || 0.45);

      const imageId = wb.addImage({ base64: item.dataUrl, extension: "png" });
      ws.addImage(imageId, {
        tl: { col: 3.1, row: excelRow - 1 + 0.1 }, // kolom D (0-based 3), baris terkait
        ext: { width: displayW, height: displayH },
        editAs: "oneCell",
      });

      const r = ws.getRow(excelRow);
      r.height = displayH * 0.75 + 6; // px -> point (~0.75)
      r.alignment = { vertical: "middle" };
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "barcodes-" + timestamp() + ".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(valid.length + " barcode di-export ke Excel.");
  }

  /* ---------- CSV / file import ---------- */

  function handleCsvFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      els.batchContent.value = String(e.target.result || "").trim();
      setMode("batch");
      generate();
    };
    reader.readAsText(file);
  }

  /* ---------- Mode switching ---------- */

  function setMode(newMode) {
    mode = newMode;
    els.modeTabs.forEach((t) => t.classList.toggle("active", t.dataset.mode === newMode));
    els.modeSingle.forEach((el) => (el.hidden = newMode !== "single"));
    els.modeTable.hidden = newMode !== "table";
    els.modeBatch.hidden = newMode !== "batch";
    if (newMode === "table" && els.tbody.children.length === 0) {
      addTableRow();
      addTableRow();
      addTableRow();
    }
  }

  /* ---------- Reset ---------- */

  function clearAll() {
    els.content.value = "";
    els.label.value = "";
    els.batchContent.value = "";
    els.csvFile.value = "";
    els.quantity.value = 1;
    els.barWidth.value = 2;
    els.barHeight.value = 100;
    els.tbody.innerHTML = "";
    if (mode === "table") { addTableRow(); addTableRow(); addTableRow(); }
    generated = [];
    showPlaceholder();
    setStatus("Belum ada barcode.");
  }

  function debouncedGenerate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generate, 350);
  }

  /* ---------- Event listeners ---------- */

  els.generateBtn.addEventListener("click", generate);
  els.exportPdfBtn.addEventListener("click", exportPdf);
  els.exportXlsxBtn.addEventListener("click", exportXlsx);
  els.clearBtn.addEventListener("click", clearAll);
  els.addRow.addEventListener("click", () => { addTableRow(); });

  els.content.addEventListener("input", debouncedGenerate);
  els.label.addEventListener("input", debouncedGenerate);
  els.batchContent.addEventListener("input", debouncedGenerate);

  [els.format, els.quantity, els.barWidth, els.barHeight, els.displayValue, els.numbered]
    .forEach((el) => el.addEventListener("change", generate));

  els.csvFile.addEventListener("change", (e) => handleCsvFile(e.target.files[0]));

  els.modeTabs.forEach((tab) =>
    tab.addEventListener("click", () => { setMode(tab.dataset.mode); generate(); })
  );

  els.form.addEventListener("submit", (e) => { e.preventDefault(); generate(); });

  // State awal
  setMode("single");
  showPlaceholder();
})();
