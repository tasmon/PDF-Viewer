import * as pdfjsLib from './pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

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
const ctx = canvas.getContext('2d');
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
  if (!pdfDoc) return;
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
    pageInfoEl.textContent = `${pageNum}/${pdfDoc.numPages}`;
    
    // Reset Virtual Pan on new page load
    scrollX = 0;
    scrollY = 0;
    updateScrollPosition();
  } catch (error) {
    console.error('Render error:', error);
  }
}

// Moves canvas smoothly inside the viewport container
function updateScrollPosition() {
  canvasContainer.style.left = `${-scrollX}px`;
  canvasContainer.style.top = `${-scrollY}px`;
}

// Local File loader
async function loadPDF(file) {
  if (!file) return;
  const fileReader = new FileReader();
  fileNameEl.textContent = "Loading...";
  
  fileReader.onload = async function() {
    const typedarray = new Uint8Array(this.result);
    try {
      pdfDoc = await pdfjsLib.getDocument({ data: typedarray }).promise;
      fileNameEl.textContent = file.name;
      
      startupScreen.classList.add('hidden');
      canvasContainer.classList.remove('hidden');
      isViewingPdf = true;
      currentPageNum = 1;
      
      await renderPage(currentPageNum);
    } catch (error) {
      alert('Error rendering local file.');
      fileNameEl.textContent = 'No File';
    }
  };
  fileReader.readAsArrayBuffer(file);
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

// Execute menu selection by index or element
function selectMenuItem(index = selectedMenuItemIndex) {
  const selectedItem = menuItems[index];
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

// --- FILE PICKER EVENT LISTENERS ---
startupFilePicker.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadPDF(file);
});

menuFilePicker.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadPDF(file);
});

// --- ADD MOUSE / CLICK EVENT LISTENERS ---
menuItems.forEach((item, idx) => {
  if (item.getAttribute('data-action') === 'open-file') {
    item.addEventListener('click', () => {
      selectedMenuItemIndex = idx;
      updateMenuHighlight();
      closeMenu();
    });
  } else {
    item.addEventListener('click', () => {
      selectedMenuItemIndex = idx;
      updateMenuHighlight();
      selectMenuItem(idx);
    });
  }
});

document.querySelector('.bottom-bar').addEventListener('click', (e) => {
  if (e.target.id === 'softkey-left') {
    if (isMenuOpen) {
      selectMenuItem();
    } else {
      openMenu();
    }
  }
});

// --- KEYDOWN EVENT ROUTER FOR EMULATOR KEYPAD ---
window.addEventListener('keydown', (e) => {
  const pressedKey = e.key;
  const pressedCode = e.code;

  // LSK / Options Key (Escape, code 27)
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

  // CASE 1: While Options overlay menu is open
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

  // CASE 2: While on Launch Screen (Hard-lock focus to Local PDF action only)
  if (!isViewingPdf) {
    if (pressedKey === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      startupFilePicker.click();
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(pressedKey)) {
      // Intentionally intercept and kill D-pad navigation on the home screen
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }

  // CASE 3: Active Canvas PDF View controls
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

  // Handle Digit/Symbol mappings explicitly
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
window.onload = () => {
  window.focus();
  document.body.addEventListener('click', () => {
    window.focus();
  });

  fileNameEl.textContent = 'No File';
  pageInfoEl.textContent = '0/0';
};
