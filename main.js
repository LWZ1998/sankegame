(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const context = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('highScore');
  const btnToggle = document.getElementById('btnToggle');
  const btnRestart = document.getElementById('btnRestart');
  const speedSelect = document.getElementById('speedSelect');
  const hintEl = document.getElementById('hint');
  const yearEl = document.getElementById('year');
  yearEl.textContent = String(new Date().getFullYear());

  const GRID_COLUMNS = 28; // 列数
  const GRID_ROWS = 20; // 行数
  const INITIAL_LENGTH = 4;
  const STORAGE_KEY = 'snake_high_score_v1';

  let highScore = Number(localStorage.getItem(STORAGE_KEY) || 0);
  highScoreEl.textContent = String(highScore);

  let cellSize = 24; // 像素，将在 resize 时自适应

  function fitCanvas() {
    // 以容器宽度为基准，保证格子为整数像素，减少锯齿
    const container = canvas.parentElement;
    const padding = 0;
    const availableWidth = Math.max(240, container.clientWidth - padding * 2);
    cellSize = Math.floor(availableWidth / GRID_COLUMNS);
    const width = cellSize * GRID_COLUMNS;
    const height = cellSize * GRID_ROWS;
    canvas.width = width;
    canvas.height = height;
  }

  fitCanvas();
  window.addEventListener('resize', () => {
    const prevCellSize = cellSize;
    fitCanvas();
    if (prevCellSize !== cellSize) {
      draw(); // 仅重绘不改变状态
    }
  });

  /** 游戏状态 **/
  let snake = [];
  let direction = { x: 1, y: 0 };
  let nextDirection = { x: 1, y: 0 };
  let food = { x: 10, y: 10 };
  let score = 0;
  let paused = true;
  let gameOver = false;

  // 速度控制：每秒多少步
  let stepsPerSecond = Number(speedSelect.value);
  speedSelect.addEventListener('change', () => {
    stepsPerSecond = Number(speedSelect.value);
  });

  function initGame() {
    snake = [];
    const startX = Math.floor(GRID_COLUMNS / 3);
    const startY = Math.floor(GRID_ROWS / 2);
    for (let i = 0; i < INITIAL_LENGTH; i++) {
      snake.unshift({ x: startX - i, y: startY });
    }
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    gameOver = false;
    paused = true;
    placeFood();
    updateScore(0);
    draw();
  }

  function updateScore(delta) {
    score += delta;
    scoreEl.textContent = String(score);
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(STORAGE_KEY, String(highScore));
      highScoreEl.textContent = String(highScore);
    }
  }

  function placeFood() {
    let x, y, retry = 0;
    do {
      x = Math.floor(Math.random() * GRID_COLUMNS);
      y = Math.floor(Math.random() * GRID_ROWS);
      retry++;
      if (retry > 500) break; // 极端情况下避免死循环
    } while (snake.some(seg => seg.x === x && seg.y === y));
    food = { x, y };
  }

  function setDirection(dx, dy) {
    // 不允许立即反向
    if (dx === -direction.x && dy === -direction.y) return;
    nextDirection = { x: dx, y: dy };
  }

  // 键盘控制
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'arrowup' || key === 'w') setDirection(0, -1);
    else if (key === 'arrowdown' || key === 's') setDirection(0, 1);
    else if (key === 'arrowleft' || key === 'a') setDirection(-1, 0);
    else if (key === 'arrowright' || key === 'd') setDirection(1, 0);
    else if (key === ' ') togglePause();
    else if (key === 'enter') restart();
  });

  // 触摸滑动控制
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (!touchStart) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 24; // 像素
    if (absX < threshold && absY < threshold) return;
    if (absX > absY) setDirection(Math.sign(dx), 0); else setDirection(0, Math.sign(dy));
    touchStart = null;
  }, { passive: true });
  canvas.addEventListener('touchend', () => { touchStart = null; }, { passive: true });

  btnToggle.addEventListener('click', togglePause);
  btnRestart.addEventListener('click', restart);
  canvas.addEventListener('click', () => { if (paused) togglePause(); });

  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    btnToggle.textContent = paused ? '开始' : '暂停';
    hintEl.style.display = paused ? 'block' : 'none';
  }

  function restart() {
    initGame();
    btnToggle.textContent = '开始';
    hintEl.style.display = 'block';
  }

  // 游戏循环（固定步长）
  let lastTime = performance.now();
  let accumulatorMs = 0;
  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;
    accumulatorMs += dt;

    const stepMs = 1000 / Math.max(2, stepsPerSecond);

    while (!paused && !gameOver && accumulatorMs >= stepMs) {
      update();
      accumulatorMs -= stepMs;
    }

    draw();
    requestAnimationFrame(loop);
  }

  function update() {
    // 应用缓冲方向，避免同一帧内多次反向
    direction = nextDirection;

    const head = snake[0];
    const newHead = { x: head.x + direction.x, y: head.y + direction.y };

    // 撞墙
    if (newHead.x < 0 || newHead.x >= GRID_COLUMNS || newHead.y < 0 || newHead.y >= GRID_ROWS) {
      return endGame();
    }
    // 撞自己
    if (snake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
      return endGame();
    }

    snake.unshift(newHead);

    // 吃到食物
    if (newHead.x === food.x && newHead.y === food.y) {
      updateScore(1);
      placeFood();
    } else {
      snake.pop();
    }
  }

  function endGame() {
    gameOver = true;
    paused = true;
    btnToggle.textContent = '开始';
    hintEl.style.display = 'block';
    hintEl.textContent = '游戏结束！按回车重开，或点击“重开”。';
  }

  function drawGrid() {
    const w = canvas.width, h = canvas.height;
    context.save();
    context.strokeStyle = '#1b1f4a';
    context.lineWidth = 1;
    for (let x = 0; x <= GRID_COLUMNS; x++) {
      context.globalAlpha = x % 5 === 0 ? 0.3 : 0.12;
      context.beginPath();
      context.moveTo(x * cellSize + 0.5, 0);
      context.lineTo(x * cellSize + 0.5, h);
      context.stroke();
    }
    for (let y = 0; y <= GRID_ROWS; y++) {
      context.globalAlpha = y % 5 === 0 ? 0.3 : 0.12;
      context.beginPath();
      context.moveTo(0, y * cellSize + 0.5);
      context.lineTo(w, y * cellSize + 0.5);
      context.stroke();
    }
    context.restore();
  }

  function roundedRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    context.clearRect(0, 0, w, h);

    // 背景渐变
    const g = context.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#10143a');
    g.addColorStop(1, '#0d1031');
    context.fillStyle = g;
    context.fillRect(0, 0, w, h);

    drawGrid();

    // 食物
    const fx = food.x * cellSize;
    const fy = food.y * cellSize;
    context.save();
    context.fillStyle = '#ffca28';
    roundedRect(fx + 3, fy + 3, cellSize - 6, cellSize - 6, Math.min(10, cellSize / 3));
    context.fill();
    context.restore();

    // 蛇
    context.save();
    for (let i = 0; i < snake.length; i++) {
      const seg = snake[i];
      const sx = seg.x * cellSize;
      const sy = seg.y * cellSize;
      const isHead = i === 0;
      const color = isHead ? '#6c7bff' : '#8b95ff';
      context.fillStyle = color;
      roundedRect(sx + 2, sy + 2, cellSize - 4, cellSize - 4, Math.min(10, cellSize / 3));
      context.fill();
      if (isHead) {
        // 眼睛
        context.fillStyle = '#111325';
        const eyeOffsetX = direction.x !== 0 ? (direction.x > 0 ? 4 : -4) : 0;
        const eyeOffsetY = direction.y !== 0 ? (direction.y > 0 ? 4 : -4) : 0;
        const cx = sx + cellSize / 2 + eyeOffsetX;
        const cy = sy + cellSize / 2 + eyeOffsetY;
        context.beginPath();
        context.arc(cx - 4, cy - 2, Math.max(1.5, cellSize * 0.06), 0, Math.PI * 2);
        context.arc(cx + 4, cy + 2, Math.max(1.5, cellSize * 0.06), 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  // 启动
  initGame();
  requestAnimationFrame(loop);
})();


