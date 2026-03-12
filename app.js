const thingPriceInput = document.getElementById("thingPrice");
const durumPriceInput = document.getElementById("durumPrice");
const resultText = document.getElementById("resultText");
const helperText = document.getElementById("helperText");
const durumGallery = document.getElementById("durumGallery");
const durumIconTemplate = document.getElementById("durumIconTemplate");
const exportCardButton = document.getElementById("exportCardButton");
const exportStatus = document.getElementById("exportStatus");

const ICON_BATCH_SIZE = 200;
const PARTIAL_ICON_THRESHOLD = 0.01;
const SHARE_CARD_WIDTH = 1200;
const SHARE_CARD_HEIGHT = 630;
const SHARE_CARD_PREVIEW_ICON_COUNT = 14;

let activeRenderToken = 0;
let renderScheduled = false;
let isExporting = false;
let latestCalculation = null;
let durumImagePromise = null;

function formatCHF(value) {
  return Number(value).toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function clearGallery() {
  durumGallery.replaceChildren();
}

function readCalculation() {
  const thingPrice = Number(thingPriceInput.value);
  const durumPrice = Number(durumPriceInput.value);

  if (!Number.isFinite(thingPrice) || !Number.isFinite(durumPrice) || durumPrice <= 0) {
    return null;
  }

  const ratio = thingPrice / durumPrice;
  const fullCount = Math.floor(ratio);
  const fractionalPart = ratio - fullCount;
  const partialPercent =
    fractionalPart > PARTIAL_ICON_THRESHOLD ? Math.round(fractionalPart * 100) : null;

  return {
    thingPrice,
    durumPrice,
    ratio,
    fullCount,
    fractionalPart,
    partialPercent,
  };
}

function createIcon(partialPercent = null) {
  const icon = durumIconTemplate.content.firstElementChild.cloneNode(true);

  if (partialPercent !== null) {
    icon.classList.add("partial");
    icon.style.setProperty("--fill", `${partialPercent}%`);
  }

  return icon;
}

function renderGallery(fullCount, partialPercent, renderToken) {
  let renderedCount = 0;

  function appendBatch() {
    if (renderToken !== activeRenderToken) {
      return;
    }

    const batchEnd = Math.min(renderedCount + ICON_BATCH_SIZE, fullCount);
    const galleryFragment = document.createDocumentFragment();

    for (let i = renderedCount; i < batchEnd; i += 1) {
      galleryFragment.appendChild(createIcon());
    }

    if (batchEnd === fullCount && partialPercent !== null) {
      galleryFragment.appendChild(createIcon(partialPercent));
    }

    durumGallery.appendChild(galleryFragment);
    renderedCount = batchEnd;

    if (renderedCount < fullCount) {
      requestAnimationFrame(appendBatch);
    }
  }

  appendBatch();
}

function calculationSummary(calculation) {
  if (calculation.partialPercent !== null) {
    return `${calculation.fullCount} full + ${(calculation.fractionalPart * 100).toFixed(0)}% of one dürüm`;
  }

  return `${calculation.fullCount} full dürüm picture${calculation.fullCount === 1 ? "" : "s"}`;
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  const clampedRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + clampedRadius, y);
  ctx.lineTo(x + width - clampedRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  ctx.lineTo(x + width, y + height - clampedRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
  ctx.lineTo(x + clampedRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  ctx.lineTo(x, y + clampedRadius);
  ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
  ctx.closePath();
}

function drawCardBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  gradient.addColorStop(0, "#fff5d9");
  gradient.addColorStop(1, "#ffd39f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  ctx.fillStyle = "rgba(255, 240, 199, 0.78)";
  ctx.beginPath();
  ctx.arc(220, 130, 150, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 182, 120, 0.35)";
  ctx.beginPath();
  ctx.arc(1020, 520, 210, 0, Math.PI * 2);
  ctx.fill();
}

function drawPreviewIcons(ctx, durumImage, fullCount, partialPercent) {
  const iconSize = 52;
  const gap = 12;
  const startX = 96;
  const iconY = 430;
  const visibleFullCount = Math.min(fullCount, SHARE_CARD_PREVIEW_ICON_COUNT);

  for (let i = 0; i < visibleFullCount; i += 1) {
    const x = startX + i * (iconSize + gap);
    ctx.drawImage(durumImage, x, iconY, iconSize, iconSize);
  }

  if (partialPercent !== null && visibleFullCount < SHARE_CARD_PREVIEW_ICON_COUNT) {
    const partialX = startX + visibleFullCount * (iconSize + gap);
    const fillWidth = (iconSize * partialPercent) / 100;

    ctx.save();
    ctx.beginPath();
    ctx.rect(partialX, iconY, fillWidth, iconSize);
    ctx.clip();
    ctx.drawImage(durumImage, partialX, iconY, iconSize, iconSize);
    ctx.restore();

    ctx.strokeStyle = "rgba(87, 39, 6, 0.35)";
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(partialX, iconY, iconSize, iconSize);
    ctx.setLineDash([]);
  }

  const remaining = fullCount - visibleFullCount;
  if (remaining > 0) {
    ctx.fillStyle = "#7e4d2a";
    ctx.font = "700 34px 'Space Grotesk', sans-serif";
    ctx.fillText(`+${remaining} more`, startX + SHARE_CARD_PREVIEW_ICON_COUNT * (iconSize + gap), iconY + 36);
  }
}

function getDurumImage() {
  if (durumImagePromise) {
    return durumImagePromise;
  }

  const iconImage = durumIconTemplate.content.querySelector("img");
  const imageSource = iconImage?.getAttribute("src") || "./assets/durum.png";

  durumImagePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load dürüm image."));
    image.src = imageSource;
  });

  return durumImagePromise;
}

async function createShareCardBlob(calculation) {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const durumImage = await getDurumImage();
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not initialize canvas.");
  }

  drawCardBackground(ctx);

  ctx.fillStyle = "rgba(255, 250, 240, 0.96)";
  drawRoundedRectPath(ctx, 56, 48, 1088, 534, 28);
  ctx.fill();
  ctx.strokeStyle = "#f0b579";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#c95f17";
  ctx.font = "700 30px 'Space Grotesk', sans-serif";
  ctx.fillText("SWITZERLAND DURUM MATH", 96, 110);

  ctx.fillStyle = "#322319";
  ctx.font = "700 84px 'Bricolage Grotesque', 'Space Grotesk', sans-serif";
  ctx.fillText(`${calculation.ratio.toFixed(2)} dürüms`, 96, 212);

  ctx.fillStyle = "#493223";
  ctx.font = "600 38px 'Space Grotesk', sans-serif";
  ctx.fillText(`${formatCHF(calculation.thingPrice)} CHF`, 96, 278);
  ctx.font = "500 30px 'Space Grotesk', sans-serif";
  ctx.fillText(`at ${formatCHF(calculation.durumPrice)} CHF per dürüm`, 96, 328);
  ctx.fillText(calculationSummary(calculation), 96, 372);

  drawPreviewIcons(ctx, durumImage, calculation.fullCount, calculation.partialPercent);

  ctx.fillStyle = "#7e4d2a";
  ctx.font = "500 24px 'Space Grotesk', sans-serif";
  ctx.fillText("durum-price-app", 954, 552);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not create share card."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = objectUrl;
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function handleExportCardClick() {
  if (!latestCalculation || isExporting) {
    return;
  }

  isExporting = true;
  exportCardButton.disabled = true;
  exportCardButton.textContent = "Exporting...";
  exportStatus.textContent = "";

  try {
    const blob = await createShareCardBlob(latestCalculation);
    const ratioLabel = latestCalculation.ratio.toFixed(2).replace(".", "-");
    const filename = `durum-share-${ratioLabel}.png`;
    const shareSummary = `${formatCHF(latestCalculation.thingPrice)} CHF = ${latestCalculation.ratio.toFixed(2)} dürüms`;
    const shareFile = new File([blob], filename, { type: "image/png" });

    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [shareFile] })
    ) {
      await navigator.share({
        title: "Dürüm Price Calculator",
        text: shareSummary,
        files: [shareFile],
      });
      exportStatus.textContent = "Share card prepared.";
    } else {
      downloadBlob(blob, filename);
      exportStatus.textContent = "Share card downloaded.";
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      exportStatus.textContent = "Share canceled.";
    } else {
      exportStatus.textContent = "Could not export right now.";
      console.error(error);
    }
  } finally {
    isExporting = false;
    exportCardButton.textContent = "Export share card";
    exportCardButton.disabled = latestCalculation === null;
  }
}

function render() {
  const renderToken = ++activeRenderToken;
  const calculation = readCalculation();

  if (!calculation) {
    latestCalculation = null;
    resultText.textContent = "Enter valid prices to calculate.";
    helperText.textContent = "";
    exportStatus.textContent = "";
    exportCardButton.disabled = true;
    clearGallery();
    return;
  }

  latestCalculation = calculation;
  exportCardButton.disabled = isExporting;
  if (!isExporting) {
    exportStatus.textContent = "";
  }

  resultText.textContent = `${formatCHF(calculation.thingPrice)} CHF = ${calculation.ratio.toFixed(2)} dürüms`;

  clearGallery();
  renderGallery(calculation.fullCount, calculation.partialPercent, renderToken);
  helperText.textContent = calculationSummary(calculation);
}

function scheduleRender() {
  if (renderScheduled) {
    return;
  }

  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

thingPriceInput.addEventListener("input", scheduleRender);
durumPriceInput.addEventListener("input", scheduleRender);
exportCardButton.addEventListener("click", handleExportCardClick);

render();
