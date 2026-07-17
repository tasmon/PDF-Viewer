// Access the global PDF.js object from the standard legacy file
var pdfjsLib = window['pdfjs-dist/build/pdf'];

// Set worker route using standard script configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.js';

// Application State
var pdfDoc = null;
var currentPageNum = 1;
var currentScale = parseFloat(localStorage.getItem('pdf_scale')) || 0.6;
var panStep = parseInt(localStorage.getItem('pdf_scroll_speed')) || 30;

var isMenuOpen = false;
var isViewingPdf = false;
var selectedMenuItemIndex = 0;

// Virtual Panning coordinates
var scrollX = 0;
var scrollY = 0;

// DOM Cache
var viewerArea = document.getElementById('viewer-area');
var canvasContainer = document.getElementById('canvas-container');
var canvas = document.getElementById('pdf-canvas');
var ctx = canvas ? canvas.getContext('2d') : null;
var fileNameEl = document.getElementById('file-name');
var pageInfoEl = document.getElementById('page-info');
var menuOverlay = document.getElementById('menu-overlay');
var menuItems = document.querySelectorAll('.menu-item');
var softkeyLeft = document.getElementById('softkey-left');
var startupScreen = document.getElementById('startup-screen');
var startupFilePicker = document.getElementById('startup-file-picker');
var menuFilePicker = document.getElementById('menu-file-picker');

// Render a single PDF Page
function renderPage(pageNum) {
  if (!pdfDoc || !ctx) return;
  
  pdfDoc.getPage(pageNum).then(function(page) {
    var viewport = page.getViewport({ scale: currentScale });
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    var renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    
    page.render(renderContext).promise.then(function() {
      pageInfoEl.textContent = pageNum + "/" + pdfDoc.numPages;
      scrollX = 0;
      scrollY = 0;
      updateScrollPosition();
    });
  }).catch(function(error) {
    console.error('Render error:', error);
  });
}

function updateScrollPosition() {
  if (canvasContainer) {
    canvasContainer.style.left = (-scrollX) + "px";
    canvasContainer.style.top = (-scrollY) + "px";
  }
}

// Legacy File Reader compatibility layer
function loadPDF(file) {
  if (!file) return;
  
  fileNameEl.textContent = "Loading...";
  pageInfoEl.textContent = "0/0";

  var fileReader = new FileReader();
  
  fileReader.onload = function(e) {
    var typedarray = new Uint8Array(e.target.result);
    
    pdfjsLib.getDocument({ data: typedarray }).promise.then(function(pdf) {
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
  };
  
  fileReader.onerror = function() {
    showErrorUI();
  };

  fileReader.readAsArrayBuffer(file);
}

function showErrorUI() {
  fileNameEl.textContent = 'Error';
  pageInfoEl.textContent = '0/0';
  alert('Unable to render document components.');
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
  menuItems.forEach(function(item, index) {
    if (index === selectedMenuItemIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

function selectMenuItem(index) {
  var idx = index !== undefined ? index : selectedMenuItemIndex;
  var selectedItem = menuItems[idx];
  if (!selectedItem) return;
  
  var action = selectedItem.getAttribute('data-action');
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

// Attach event handlers safely
if (startupFilePicker) {
  startupFilePicker.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (file) loadPDF(file);
  });
}

if (menuFilePicker) {
  menuFilePicker.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (file) loadPDF(file);
  });
}

menuItems.forEach(function(item, idx) {
  item.addEventListener('click', function() {
    selectedMenuItemIndex = idx;
    updateMenuHighlight();
    if (item.getAttribute('data-action') !== 'open-file') {
      selectMenuItem(idx);
    }
  });
});

var bottomBar = document.querySelector('.bottom-bar');
if (bottomBar) {
  bottomBar.addEventListener('click', function(e) {
    if (e.target.id === 'softkey-left') {
      if (isMenuOpen) {
        selectMenuItem();
      } else {
        openMenu();
      }
    }
  });
}

// Emulator standard physical Key handler layout
window.addEventListener('keydown', function(e) {
  var pressedKey = e.key;

  if (pressedKey === 'Escape' || e.keyCode === 27) {
    e.preventDefault();
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
      if (startupFilePicker) startupFilePicker.click();
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(pressedKey)) {
      e.preventDefault();
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
      var maxScrollY = Math.max(0, canvas.height - 260);
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
      var maxScrollX = Math.max(0, canvas.width - 240);
      scrollX = Math.min(maxScrollX, scrollX + panStep);
      updateScrollPosition();
      break;
    case 'Enter':
      e.preventDefault();
      openMenu();
      break;
  }

  if (pressedKey === '*' || e.keyCode === 106) {
    e.preventDefault();
    if (pdfDoc && currentPageNum > 1) {
      currentPageNum--;
      renderPage(currentPageNum);
    }
  }

  if (pressedKey === '#' || pressedKey === '3') {
    e.preventDefault();
    if (pdfDoc && currentPageNum < pdfDoc.numPages) {
      currentPageNum++;
      renderPage(currentPageNum);
    }
  }

  if (pressedKey === '2') {
    e.preventDefault();
    if (pdfDoc) {
      currentScale += 0.15;
      renderPage(currentPageNum);
    }
  }

  if (pressedKey === '8') {
    e.preventDefault();
    if (pdfDoc && currentScale > 0.2) {
      currentScale -= 0.15;
      renderPage(currentPageNum);
    }
  }
});

// Window startup loader initialization block
window.addEventListener('load', function() {
  window.focus();
  document.body.addEventListener('click', function() {
    window.focus();
  });
  if (fileNameEl) fileNameEl.textContent = 'No File';
  if (pageInfoEl) pageInfoEl.textContent = '0/0';
});