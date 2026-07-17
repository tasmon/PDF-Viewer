// Universal wrapper extracting the global bundle instance safely
const pdfjsLib = globalThis.pdfjsLib || window.pdfjsLib || window['pdfjs-dist/build/pdf'];

// Set worker route using modern fallback format compatibility
if (pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';
}

// Application State
let pdfDoc = null;
let currentPageNum = 1;
let currentScale = parseFloat(localStorage.getItem('pdf_scale')) || 0.6;
let panStep = parseInt(localStorage.getItem('pdf_scroll_speed')) || 30;

let isMenuOpen = false;
let isViewingPdf = false;
let selectedMenuItemIndex = 0;

// Virtual Panning coordinates
let scrollX = 0;
let scrollY = 0;

// DOM Cache
const viewerArea = document.getElementById('viewer-area');
const canvasContainer = document.getElementById('canvas-container');
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const fileNameEl = document.getElementById('file-name');
const pageInfoEl = document.getElementById('page-info');
const menuOverlay = document.getElementById('menu-overlay');
const menuItems = document.querySelectorAll('.menu-item');
const softkeyLeft = document.getElementById('softkey-left');

// Startup Screen DOM Elements
const startupScreen = document.getElementById('startup-screen');
const lblLocal = document.getElementById('lbl-local-file');

// File pickers
const startupFilePicker = document.getElementById('startup-file-picker');
const menuFilePicker = document.getElementById('menu-file-picker');

// Render a single PDF Page
async function renderPage(pageNum) {
  if (!pdfDoc || !ctx) return;
  try {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: currentScale });
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Smooth string formatting updates
    pageInfoEl.textContent = pageNum + "/" + pdfDoc.numPages;
    
    // Reset Virtual Pan on new page load
    scrollX = 0;
    scrollY = 0;
    updateScrollPosition();
  } catch (error) {
    console.error('Render error:', error);
  }
}

function updateScrollPosition() {
  if (canvasContainer) {
    canvasContainer.style.left = (-scrollX) + "px";
    canvasContainer.style.top = (-scrollY) + "px";
  }
}

// Fixed file execution logic using safe Native Blob streaming
function loadPDF(file) {
  if (!file) return;
  if (!pdfjsLib) {
    alert("PDF library failed to load properly.");
    return;
  }
  
  fileNameEl.textContent = "Loading...";
  pageInfoEl.textContent = "0/0";

  try {
    // Generate secure cross-platform proxy URL
    const blobUrl = URL.createObjectURL(file);
    
    pdfjsLib.getDocument(blobUrl).promise.then(function(pdf) {
      pdfDoc = pdf;
      fileNameEl.textContent = file.name;
      startupScreen.classList.add('hidden');
      canvasContainer.classList.remove('hidden');
      isViewingPdf = true;
      currentPageNum = 1;
      
      renderPage(currentPageNum);
    }).catch(function(err) {
      console.error(err);
      showErrorUI();
    });
  } catch (error) {
    showErrorUI();
  }
}

function showErrorUI() {
  fileNameEl.textContent = 'Error';
  pageInfoEl.textContent = '0/0';
  alert('Unable to load or render document elements.');
}

// Menu overlay triggers
function openMenu() {
  isMenuOpen = true;
  menuOverlay.classList.remove('hidden');
  softkeyLeft.textContent = 'Select';
  updateMenuHighlight();
}

function closeMenu() {
  isMenuOpen = false;
  menuOverlay.classList.add('hidden');
  softkeyLeft.textContent = 'Options';
}

function updateMenuHighlight() {
  menuItems.forEach((item, index) => {
    if (index === selectedMenuItemIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

function selectMenuItem(index = selectedMenuItemIndex) {
  const selectedItem = menuItems[index];
  if (!selectedItem) return;
  
  const action = selectedItem.getAttribute('data-action');
  
  if (action !== 'open-file') {
    closeMenu();
  }

  switch (action) {
    case 'open-file':
      menuFilePicker.click();
      closeMenu();
      break;
    case 'help':
      window.location.href = 'help.html';
      break;
    case 'about':
      window.location.href = 'about.html';
      break;
    case 'settings':
      window.location.href = 'settings.html';
      break;
  }
}

// --- INITIALIZE ALL EVENT BINDINGS SAFELY ---
if (startupFilePicker) {
  startupFilePicker.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadPDF(file);
  });
}

if (menuFilePicker) {
  menuFilePicker.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadPDF(file);
  });
}

menuItems.forEach((item, idx) => {
  item.addEventListener('click', (e) => {
    selectedMenuItemIndex = idx;
    updateMenuHighlight();
    if (item.getAttribute('data-action') !== 'open-file') {
      selectMenuItem(idx);
    }
  });
});

const bottomBar = document.querySelector('.bottom-bar');
if (bottomBar) {
  bottomBar.addEventListener('click', (e) => {
    if (e.target.id === 'softkey-left') {
      if (isMenuOpen) {
        selectMenuItem();
      } else {
        openMenu();
      }
    }
  });
}

// --- KEYDOWN EMULATOR SYSTEM CONTROLLER ---
window.addEventListener('keydown', (e) => {
  const pressedKey = e.key;
  const pressedCode = e.code;

  if (pressedKey === 'Escape' || e.keyCode === 27) {
    e.preventDefault();
    e.stopPropagation();
    if (isMenuOpen) {
      selectMenuItem();
    } else {
      openMenu();
    }
    return;
  }

  if (isMenuOpen) {
    switch (pressedKey) {
      case 'ArrowUp':
        e.preventDefault();
        selectedMenuItemIndex = (selectedMenuItemIndex - 1 + menuItems.length) % menuItems.length;
        updateMenuHighlight();
        break;
      case 'ArrowDown':
        e.preventDefault();
        selectedMenuItemIndex = (selectedMenuItemIndex + 1) % menuItems.length;
        updateMenuHighlight();
        break;
      case 'Enter':
        e.preventDefault();
        selectMenuItem();
        break;
    }
    return;
  }

  if (!isViewingPdf) {
    if (pressedKey === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (startupFilePicker) startupFilePicker.click();
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(pressedKey)) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }

  switch (pressedKey) {
    case 'ArrowUp':
      e.preventDefault();
      scrollY = Math.max(0, scrollY - panStep);
      updateScrollPosition();
      break;
    case 'ArrowDown':
      e.preventDefault();
      const maxScrollY = Math.max(0, canvas.height - 260);
      scrollY = Math.min(maxScrollY, scrollY + panStep);
      updateScrollPosition();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      scrollX = Math.max(0, scrollX - panStep);
      updateScrollPosition();
      break;
    case 'ArrowRight':
      e.preventDefault();
      const maxScrollX = Math.max(0, canvas.width - 240);
      scrollX = Math.min(maxScrollX, scrollX + panStep);
      updateScrollPosition();
      break;
    case 'Enter':
      e.preventDefault();
      openMenu();
      break;
  }

  if (pressedKey === '*' || pressedCode === 'NumpadMultiply') {
    e.preventDefault();
    if (pdfDoc && currentPageNum > 1) {
      currentPageNum--;
      renderPage(currentPageNum);
    }
  }

  if (pressedKey === '#' || (pressedCode === 'Digit3' && !isMenuOpen && isViewingPdf)) {
    e.preventDefault();
    if (pdfDoc && currentPageNum < pdfDoc.numPages) {
      currentPageNum++;
      renderPage(currentPageNum);
    }
  }

  if (pressedKey === '2' || pressedCode === 'Digit2') {
    e.preventDefault();
    if (pdfDoc) {
      currentScale += 0.15;
      renderPage(currentPageNum);
    }
  }

  if (pressedKey === '8' || pressedCode === 'Digit8') {
    e.preventDefault();
    if (pdfDoc && currentScale > 0.2) {
      currentScale -= 0.15;
      renderPage(currentPageNum);
    }
  }
});

// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
  window.focus();
  document.body.addEventListener('click', () => {
    window.focus();
  });

  if (fileNameEl) fileNameEl.textContent = 'No File';
  if (pageInfoEl) pageInfoEl.textContent = '0/0';
});