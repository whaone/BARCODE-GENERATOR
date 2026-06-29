/* Barcode Generator
 * Fitur:
 * - Mode Tunggal: generate barcode dari satu teks/angka, bisa diatur jumlahnya
 * - Mode Batch/CSV: tiap baris (atau baris CSV) menjadi barcode berbeda
 * - Pilihan format: CODE128, EAN-13, EAN-8, UPC, CODE39, ITF-14, MSI, dll
 * - Download PNG per barcode
 * - Export semua ke PDF
 * Library: JsBarcode (render) + jsPDF (export)
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
    generateBtn: $("generate-btn"),
    exportBtn: $("export-btn"),
    clearBtn: $("clear-btn"),
    grid: $("qr-grid"),
    countBadge: $("count-badge"),
    statusText: $("status-text"),
    modeTabs: document.querySelectorAll(".mode-tab"),
    modeSingle: document.querySelector(".mode-single"),
    modeBatch: document.querySelector(".mode-batch"),
  };

  // State
  let generated = []; // { dataUrl, caption, index, showIndex }
  let mode = "single"; // 'single' | 'batch'
  let debounceTimer = null;

  /* ---------- Utilities ---------- */

  function clampNum(value, min, max, fallback) {
    const n = parseFloat(value);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function setStatus(text) {
    els.statusText.textContent = text;
  }

  function showPlaceholder() {
    els.grid.classList.add("empty");
    els.grid.innerHTML =
      '<div class="placeholder"><div class="placeholder-icon">|||</div>' +
      "<p>Masukkan teks atau angka untuk melihat barcode di sini.</p></div>";
    els.countBadge.textContent = "0";
    els.exportBtn.disabled = true;
  }

  function safeFileName(str, fallback) {
    const clean = (str || "").replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
    return (clean || fallback).slice(0, 40);
  }

  /* ---------- Parsing daftar ---------- */

  function parseLine(line) {
    let content = line;
    let label = "";
    if (line.includes("|")) {
      const parts = line.split("|");
      content = parts[0].trim();
      label = parts.slice(1).join("|").trim();
    } else if (line.includes(",")) {
      const parts = line.split(",");
      content = parts[0].trim();
      label = parts.slice(1).join(",").trim();
    }
    return { content: content.trim(), label };
  }

  function buildItems() {
    const numbered = els.numbered.value === "yes";
    const items = [];

    if (mode === "single") {
      const content = els.content.value.trim();
      if (!content) return items;
      const label = els.label.value.trim();
      const quantity = clampNum(els.quantity.value, 1, 500, 1);
      els.quantity.value = quantity;
      for (let i = 0; i < quantity; i++) {
        items.push({ content, label });
      }
    } else {
      const lines = els.batchContent.value
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      lines.forEach((line) => {
        const { content, label } = parseLine(line);
        if (content) items.push({ content, label });
      });
    }

    return items.map((it, idx) => ({
      content: it.content,
      label: it.label,
      index: idx + 1,
      showIndex: numbered,
    }));
  }

  /* ---------- Generate barcode ---------- */

  // Mengembalikan { dataUrl } atau { error }
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
    let errorCount = 0;
    let lastError = "";

    items.forEach((it) => {
      const result = makeBarcode(it.content, opts);
      if (result.error) {
        errorCount++;
        lastError = result.error;
        generated.push({
          error: result.error,
          caption: it.label || it.content,
          index: it.index,
          showIndex: it.showIndex,
        });
      } else {
        generated.push({
          dataUrl: result.dataUrl,
          ratio: result.height / result.width,
          caption: it.label || it.content,
          index: it.index,
          showIndex: it.showIndex,
        });
      }
    });

    renderGrid();

    const okCount = generated.length - errorCount;
    els.exportBtn.disabled = okCount === 0;

    if (errorCount === 0) {
      setStatus(okCount + " barcode dibuat.");
    } else if (okCount === 0) {
      setStatus("Gagal: " + lastError);
    } else {
      setStatus(okCount + " barcode dibuat, " + errorCount + " gagal (format tidak cocok).");
    }
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

  /* ---------- Export PDF ---------- */

  function exportPdf() {
    const valid = generated.filter((g) => !g.error);
    if (!valid.length) return;
    setStatus("Menyiapkan PDF...");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;
    const cols = 2;
    const gap = 8;
    const captionH = 7;

    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;

    valid.forEach((item, i) => {
      // Jaga rasio asli barcode
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
      const maxChars = 36;
      if (caption.length > maxChars) caption = caption.slice(0, maxChars - 1) + "\u2026";
      doc.text(caption, x + imgW / 2, y + imgH + 4, { align: "center" });
    });

    const fname = "barcodes-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".pdf";
    doc.save(fname);
    setStatus(valid.length + " barcode di-export ke PDF.");
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
    els.modeSingle.hidden = newMode !== "single";
    els.modeBatch.hidden = newMode !== "batch";
    const qtyField = els.quantity.closest(".field");
    if (qtyField) qtyField.style.opacity = newMode === "single" ? "1" : "0.45";
    els.quantity.disabled = newMode !== "single";
  }

  /* ---------- Reset ---------- */

  function clearAll() {
    els.form.reset();
    els.quantity.value = 1;
    els.barWidth.value = 2;
    els.barHeight.value = 100;
    els.batchContent.value = "";
    els.csvFile.value = "";
    setMode("single");
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
  els.exportBtn.addEventListener("click", exportPdf);
  els.clearBtn.addEventListener("click", clearAll);

  els.content.addEventListener("input", debouncedGenerate);
  els.label.addEventListener("input", debouncedGenerate);
  els.batchContent.addEventListener("input", debouncedGenerate);

  [els.format, els.quantity, els.barWidth, els.barHeight, els.displayValue, els.numbered].forEach(
    (el) => el.addEventListener("change", generate)
  );

  els.csvFile.addEventListener("change", (e) => handleCsvFile(e.target.files[0]));

  els.modeTabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      setMode(tab.dataset.mode);
      generate();
    })
  );

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    generate();
  });

  // State awal
  setMode("single");
  showPlaceholder();
})();
