(async function () {
    await OpenVibe.primeEnvironment();
    await OpenVibe.renderChrome('games');

    const DIFFS = {
        easy:   { rows: 9,  cols: 9,  mines: 10 },
        medium: { rows: 16, cols: 16, mines: 40 },
        hard:   { rows: 16, cols: 30, mines: 99 },
    };

    let diff = 'easy';
    let board = [];
    let revealed = [];
    let flagged = [];
    let gameOver = false;
    let gameWon = false;
    let firstClick = true;
    let timer = 0;
    let timerInterval = null;
    let minesLeft = 0;

    const boardEl = document.getElementById('ms-board');
    const minesEl = document.getElementById('ms-mines-left');
    const timeEl  = document.getElementById('ms-time');
    const resetEl = document.getElementById('ms-reset');
    const overlay = document.getElementById('ms-overlay');

    function startTimer() {
        clearInterval(timerInterval);
        timer = 0;
        timeEl.textContent = '0';
        timerInterval = setInterval(() => { timer++; timeEl.textContent = timer; }, 1000);
    }

    function stopTimer() { clearInterval(timerInterval); }

    function placeMines(safeR, safeC) {
        const { rows, cols, mines } = DIFFS[diff];
        let placed = 0;
        while (placed < mines) {
            const r = Math.floor(Math.random() * rows);
            const c = Math.floor(Math.random() * cols);
            if (board[r][c] === -1) continue;
            if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
            board[r][c] = -1;
            placed++;
        }
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (board[r][c] === -1) continue;
                let count = 0;
                neighbors(r, c).forEach(([nr, nc]) => { if (board[nr][nc] === -1) count++; });
                board[r][c] = count;
            }
        }
    }

    function neighbors(r, c) {
        const { rows, cols } = DIFFS[diff];
        const out = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push([nr, nc]);
            }
        }
        return out;
    }

    function initGame() {
        const { rows, cols, mines } = DIFFS[diff];
        stopTimer();
        gameOver = false;
        gameWon = false;
        firstClick = true;
        timer = 0;
        timeEl.textContent = '0';
        minesLeft = mines;
        minesEl.textContent = minesLeft;
        resetEl.textContent = '🙂';
        overlay.classList.remove('show');

        board    = Array.from({ length: rows }, () => Array(cols).fill(0));
        revealed = Array.from({ length: rows }, () => Array(cols).fill(false));
        flagged  = Array.from({ length: rows }, () => Array(cols).fill(false));

        boardEl.style.gridTemplateColumns = `repeat(${cols}, 34px)`;
        renderBoard();
    }

    function renderBoard() {
        const { rows, cols } = DIFFS[diff];
        boardEl.innerHTML = '';
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('button');
                cell.className = 'ms-cell';
                cell.dataset.r = r;
                cell.dataset.c = c;

                if (revealed[r][c]) {
                    if (board[r][c] === -1) {
                        cell.classList.add('ms-cell--mine-hit');
                        cell.textContent = '💥';
                    } else {
                        cell.classList.add('ms-cell--revealed');
                        if (board[r][c] > 0) {
                            cell.textContent = board[r][c];
                            cell.classList.add('ms-n' + board[r][c]);
                        }
                    }
                } else if (flagged[r][c]) {
                    cell.classList.add('ms-cell--flagged');
                    cell.textContent = '🚩';
                } else if (gameOver && board[r][c] === -1) {
                    cell.classList.add('ms-cell--mine-shown');
                    cell.textContent = '💣';
                } else {
                    cell.classList.add('ms-cell--hidden');
                }

                cell.addEventListener('click', onCellClick);
                cell.addEventListener('contextmenu', onCellRightClick);
                boardEl.appendChild(cell);
            }
        }
    }

    function onCellClick(e) {
        const r = +e.currentTarget.dataset.r;
        const c = +e.currentTarget.dataset.c;
        if (gameOver || gameWon || flagged[r][c] || revealed[r][c]) return;

        if (firstClick) {
            firstClick = false;
            placeMines(r, c);
            startTimer();
        }

        if (board[r][c] === -1) {
            revealed[r][c] = true;
            gameOver = true;
            stopTimer();
            resetEl.textContent = '😵';
            renderBoard();
            showModal(false, timer);
            return;
        }

        flood(r, c);
        renderBoard();
        checkWin();
    }

    function onCellRightClick(e) {
        e.preventDefault();
        const r = +e.currentTarget.dataset.r;
        const c = +e.currentTarget.dataset.c;
        if (gameOver || gameWon || revealed[r][c] || firstClick) return;
        flagged[r][c] = !flagged[r][c];
        minesLeft += flagged[r][c] ? -1 : 1;
        minesEl.textContent = minesLeft;
        renderBoard();
    }

    function flood(r, c) {
        if (revealed[r][c] || flagged[r][c]) return;
        revealed[r][c] = true;
        if (board[r][c] === 0) {
            neighbors(r, c).forEach(([nr, nc]) => flood(nr, nc));
        }
    }

    function checkWin() {
        const { rows, cols, mines } = DIFFS[diff];
        let unrevealed = 0;
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++)
                if (!revealed[r][c]) unrevealed++;
        if (unrevealed === mines) {
            gameWon = true;
            stopTimer();
            resetEl.textContent = '😎';
            showModal(true, timer);
        }
    }

    function showModal(won, secs) {
        document.getElementById('ms-modal-emoji').textContent = won ? '🎉' : '💥';
        document.getElementById('ms-modal-title').textContent = won ? 'You cleared it!' : 'Boom!';
        document.getElementById('ms-modal-sub').textContent = won
            ? `Finished in ${secs}s on ${diff}.`
            : 'Better luck next time.';
        overlay.classList.add('show');
    }

    document.querySelectorAll('.ms-diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ms-diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            diff = btn.dataset.diff;
            initGame();
        });
    });

    resetEl.addEventListener('click', initGame);
    document.getElementById('ms-modal-btn').addEventListener('click', () => {
        overlay.classList.remove('show');
        initGame();
    });

    initGame();
})();
