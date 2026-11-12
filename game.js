(() => {
  'use strict';

  const SIZE = 8;
  const COLORS = ['#ef4444','#f59e0b','#22c55e','#3b82f6','#a855f7','#06b6d4', '#ec4899'];
  const BEST_KEY = 'blockblast-best-v1';

  const SHAPES = [
    [[0,0]],
    [[0,0],[0,1]], [[0,0],[1,0]],
    [[0,0],[0,1],[0,2]], [[0,0],[1,0],[2,0]],
    [[0,0],[0,1],[1,0]], [[0,0],[1,0],[1,1]], [[0,1],[1,0],[1,1]], [[0,0],[0,1],[1,1]],
    [[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[0,2],[1,0]], [[0,0],[0,1],[0,2],[1,2]],
    [[0,0],[0,1],[1,1],[1,2]], [[0,1],[0,2],[1,0],[1,1]],
    [[0,0],[0,1],[0,2],[1,1]],
    [[0,0],[0,1],[0,2],[0,3],[0,4]], [[0,0],[1,0],[2,0],[3,0],[4,0]],
    [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]], [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],
  ];

  let board = [];
  let tray = [null, null, null];
  let score = 0;
  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  let combo = 0;
  let gameOver = false;
  let drag = null;
  let newBestThisGame = false;
  let rafId = null;

  const boardEl = document.getElementById('board');
  const boardWrapper = document.querySelector('.board-wrapper');
  const trayEl = document.getElementById('tray');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const comboEl = document.getElementById('combo');
  const overlay = document.getElementById('overlay');
  const finalScoreEl = document.getElementById('finalScore');
  const overlayMsg = document.getElementById('overlayMsg');
  const fxLayer = document.getElementById('fx-layer');
  const appEl = document.getElementById('app');
  const landingEl = document.getElementById('landing');

  bestEl.textContent = best;

  function newBoard() {
    board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function randInt(n) {
    if (window.crypto && crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      const max = Math.floor(0xFFFFFFFF / n) * n;
      let v;
      do { crypto.getRandomValues(arr); v = arr[0]; } while (v >= max);
      return v % n;
    }
    return Math.floor(Math.random() * n);
  }

  function randomPiece() {
    const shape = SHAPES[randInt(SHAPES.length)];
    const color = COLORS[randInt(COLORS.length)];
    return {
      cells: shape.map(([r, c]) => [r, c]),
      color,
      rows: Math.max(...shape.map(s => s[0])) + 1,
      cols: Math.max(...shape.map(s => s[1])) + 1,
    };
  }

  function refillTray() {
    for (let i = 0; i < 3; i++) if (!tray[i]) tray[i] = randomPiece();
  }

  function canPlace(piece, r0, c0) {
    for (const [dr, dc] of piece.cells) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
      if (board[r][c] !== null) return false;
    }
    return true;
  }

  function anyPlacement(piece) {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (canPlace(piece, r, c)) return true;
    return false;
  }

  function updateDangerState() {
    let empty = 0;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (board[r][c] === null) empty++;
    
    if (empty < 20) {
      boardWrapper.classList.add('danger');
    } else {
      boardWrapper.classList.remove('danger');
    }
  }

  function render() {
    boardEl.innerHTML = '';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const v = board[r][c];
        if (v !== null) {
          cell.classList.add('filled');
          cell.style.setProperty('--c', v);
        }
        boardEl.appendChild(cell);
      }
    }
    trayEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const piece = tray[i];
      if (!piece) slot.classList.add('empty');
      else slot.appendChild(buildMiniPiece(piece, i));
      trayEl.appendChild(slot);
    }
    scoreEl.textContent = score;
    comboEl.textContent = 'x' + combo;
    comboEl.className = 'value combo-val' + (combo > 1 ? ' combo-active' : '');
    updateDangerState();
  }

  function buildMiniPiece(piece, idx) {
    const el = document.createElement('div');
    el.className = 'mini-piece';
    el.style.gridTemplateColumns = `repeat(${piece.cols}, 1fr)`;
    el.style.gridTemplateRows = `repeat(${piece.rows}, 1fr)`;
    const base = 18;
    el.style.width = (piece.cols * base + (piece.cols - 1) * 3) + 'px';
    el.style.height = (piece.rows * base + (piece.rows - 1) * 3) + 'px';
    const map = new Set(piece.cells.map(([r, c]) => r + ',' + c));
    for (let r = 0; r < piece.rows; r++) {
      for (let c = 0; c < piece.cols; c++) {
        const d = document.createElement('div');
        d.style.width = base + 'px';
        d.style.height = base + 'px';
        if (map.has(r + ',' + c)) {
          d.className = 'mini-cell';
          d.style.setProperty('--c', piece.color);
        }
        el.appendChild(d);
      }
    }
    el.addEventListener('pointerdown', e => startDrag(e, idx, el));
    return el;
  }

  function startDrag(e, idx, el) {
    if (gameOver || !tray[idx]) return;
    if (drag) return;
    e.preventDefault();

    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);

    const piece = tray[idx];
    const boardRect = boardEl.getBoundingClientRect();
    const gap = 4;
    const innerW = boardRect.width;
    const cw = (innerW - gap * 7) / 8;

    const ghost = document.createElement('div');
    ghost.className = 'ghost';
    ghost.style.gridTemplateColumns = `repeat(${piece.cols}, ${cw}px)`;
    ghost.style.gridTemplateRows = `repeat(${piece.rows}, ${cw}px)`;
    ghost.style.gap = gap + 'px';
    ghost.style.setProperty('--c', piece.color);
    const map = new Set(piece.cells.map(([r, c]) => r + ',' + c));
    for (let r = 0; r < piece.rows; r++) {
      for (let c = 0; c < piece.cols; c++) {
        const d = document.createElement('div');
        d.style.width = cw + 'px';
        d.style.height = cw + 'px';
        d.className = map.has(r + ',' + c) ? 'g-cell' : 'g-empty';
        ghost.appendChild(d);
      }
    }
    document.body.appendChild(ghost);

    drag = { idx, piece, ghost, cw, gap, valid: false, dropR: null, dropC: null, sourceEl: el };
    el.style.opacity = '0.3';

    moveDrag(e.clientX, e.clientY);
    updatePreview(e.clientX, e.clientY);

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function moveDrag(x, y) {
    if (!drag) return;
    // FIXED: Using translate3d for hardware acceleration (buttery smooth)
    drag.ghost.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0)`;
  }

  function clearPreview() {
    document.querySelectorAll('.cell.preview, .cell.invalid').forEach(el => {
      el.classList.remove('preview', 'invalid');
      el.style.removeProperty('--c');
    });
  }

  function updatePreview(x, y) {
    clearPreview();
    if (!drag) return;
    
    const boardRect = boardEl.getBoundingClientRect();
    const { cw, gap, piece } = drag;
    const gw = piece.cols * cw + (piece.cols - 1) * gap;
    const gh = piece.rows * cw + (piece.rows - 1) * gap;
    const total = cw + gap;
    
    const col = Math.round((x - gw / 2 - boardRect.left) / total);
    const row = Math.round((y - gh / 2 - boardRect.top) / total);
    
    drag.dropR = row; drag.dropC = col;

    if (!canPlace(piece, row, col)) {
      drag.valid = false;
      for (const [dr, dc] of piece.cells) {
        const r = row + dr, c = col + dc;
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
          boardEl.children[r * SIZE + c].classList.add('invalid');
        }
      }
      return;
    }
    drag.valid = true;
    for (const [dr, dc] of piece.cells) {
      const r = row + dr, c = col + dc;
      const el = boardEl.children[r * SIZE + c];
      el.classList.add('preview');
      el.style.setProperty('--c', piece.color);
    }
  }

  // FIXED: Throttled onMove using requestAnimationFrame for maximum fluidity
  function onMove(e) {
    if (!drag) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      moveDrag(e.clientX, e.clientY);
      updatePreview(e.clientX, e.clientY);
    });
  }

  function onUp() {
    if (!drag) return;
    if (rafId) cancelAnimationFrame(rafId);
    const d = drag;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    d.ghost.remove();
    if (d.sourceEl) d.sourceEl.style.opacity = '';
    clearPreview();
    drag = null;
    if (d.valid && d.dropR !== null && d.dropC !== null) {
      commit(d.piece, d.dropR, d.dropC, d.idx);
    }
  }

  function triggerFx(cleared) {
    fxLayer.className = 'fx-layer';
    boardEl.classList.remove('shake', 'shake-hard');
    
    void fxLayer.offsetWidth;
    void boardEl.offsetWidth;

    const intensity = Math.min(cleared, 4);
    fxLayer.classList.add(`fx-${intensity}`);
    boardEl.classList.add(intensity >= 3 ? 'shake-hard' : 'shake');
  }

  function commit(piece, r0, c0, trayIdx) {
    for (const [dr, dc] of piece.cells) board[r0 + dr][c0 + dc] = piece.color;
    tray[trayIdx] = null;
    score += piece.cells.length;

    const rows = [], cols = [];
    for (let r = 0; r < SIZE; r++) if (board[r].every(v => v !== null)) rows.push(r);
    for (let c = 0; c < SIZE; c++) {
      let full = true;
      for (let r = 0; r < SIZE; r++) if (board[r][c] === null) { full = false; break; }
      if (full) cols.push(c);
    }
    const cleared = rows.length + cols.length;
    if (cleared > 0) {
      const rowSet = new Set(rows), colSet = new Set(cols);
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
          if (rowSet.has(r) || colSet.has(c)) board[r][c] = null;
      combo++;
      score += 10 * cleared * combo;
      triggerFx(cleared);
    } else {
      combo = 0;
    }

    if (score > best) {
      best = score;
      newBestThisGame = true;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = best;
    }

    if (tray.every(p => p === null)) refillTray();
    render();

    if (isGameOver()) endGame();
  }

  function isGameOver() {
    for (const p of tray) {
      if (!p) continue;
      if (anyPlacement(p)) return false;
    }
    return true;
  }

  function endGame() {
    gameOver = true;
    finalScoreEl.textContent = score;
    overlayMsg.textContent = newBestThisGame ? 'New personal best!' : '';
    overlay.classList.remove('hidden');
  }

  function resetGame() {
    if (rafId) cancelAnimationFrame(rafId);
    if (drag) {
      drag.ghost.remove();
      if (drag.sourceEl) drag.sourceEl.style.opacity = '';
      drag = null;
      clearPreview();
    }

    newBoard();
    tray = [null, null, null];
    score = 0; combo = 0; gameOver = false; newBestThisGame = false;
    overlay.classList.add('hidden');
    refillTray();
    render();
  }

  // --- Event Listeners ---
  document.getElementById('playBtn').addEventListener('click', () => {
    landingEl.classList.add('hidden');
    appEl.classList.remove('app-hidden');
    resetGame();
  });

  document.getElementById('newGame').addEventListener('click', resetGame);
  document.getElementById('restart').addEventListener('click', resetGame);
  document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });

  // Initialize board state in background
  newBoard();
  tray = [null, null, null];
})();
