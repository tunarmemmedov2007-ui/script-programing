document.addEventListener("DOMContentLoaded", () => {

    // ====================================================================================
    // 1) REMOVE DUPLICATE GAME INSTANCES (prevents 2 memory games appearing due to HTML)
    // ====================================================================================
    const allBoards = document.querySelectorAll("#mgBoard");

    // If the page accidentally contains more than 1 mgBoard (HTML mistake), remove extras
    if (allBoards.length > 1) {
        for (let i = 1; i < allBoards.length; i++) {
            // Find a container to remove (so the whole section is removed cleanly)
            const container =
                allBoards[i].closest("#memory-game") ||
                allBoards[i].closest(".memory-game") ||
                allBoards[i].closest("section") ||
                allBoards[i].parentElement;

            if (container) container.remove();
            else allBoards[i].remove();
        }
    }

    // ====================================================================================
    // 2) BASIC REFERENCES (board, difficulty dropdown, buttons)
    // ====================================================================================
    const board = document.getElementById("mgBoard");
    const difficultySelector = document.getElementById("mgDifficulty");
    const startBtn = document.getElementById("mgStartBtn");
    const restartBtn = document.getElementById("mgRestartBtn");

    // If any required part is missing, stop the script
    if (!board || !difficultySelector || !startBtn || !restartBtn) {
        console.error("Memory Game: missing required HTML IDs (mgBoard/mgDifficulty/mgStartBtn/mgRestartBtn).");
        return;
    }

    // Wrap = closest container around the game, used for positioning win message
    const wrap =
        board.closest(".memory-game-wrap") ||
        document.querySelector(".memory-game-wrap") ||
        board.parentElement ||
        document.body;

    // Ensure wrap has a positioning context (needed for the win popup animation)
    if (wrap && getComputedStyle(wrap).position === "static") {
        wrap.style.position = "relative";
    }

    // ====================================================================================
    // 3) CREATE PAUSE BUTTON PROGRAMMATICALLY
    // ====================================================================================
    let pauseBtn = document.getElementById("mgPauseBtn");

    // If no pause button exists in HTML, create one
    if (!pauseBtn) {
        const btnRow = startBtn.closest(".mg-right") || startBtn.parentElement || wrap;

        pauseBtn = document.createElement("button");
        pauseBtn.id = "mgPauseBtn";
        pauseBtn.type = "button";
        pauseBtn.className = "btn btn-outline-secondary";
        pauseBtn.textContent = "Pause";
        pauseBtn.disabled = true;

        // Insert near restart button if possible
        if (btnRow && restartBtn.parentElement === btnRow) btnRow.insertBefore(pauseBtn, restartBtn);
        else if (btnRow) btnRow.appendChild(pauseBtn);
        else wrap.appendChild(pauseBtn);
    } else {
        pauseBtn.type = "button";
    }

    // ====================================================================================
    // 4) CREATE WIN MESSAGE (shows when all pairs are matched)
    // ====================================================================================
    let winMessage = document.getElementById("mgWin");

    if (!winMessage) {
        winMessage = document.createElement("div");
        winMessage.id = "mgWin";
        winMessage.textContent = "You win!";
        winMessage.setAttribute("role", "status");
        winMessage.setAttribute("aria-live", "polite");
        wrap.appendChild(winMessage);
    }

    // Optional UI stats (moves/matches/timer/best score)
    const movesDisplay = document.getElementById("mgMoves");
    const matchesDisplay = document.getElementById("mgMatches");
    const timeDisplay = document.getElementById("mgTime");
    const bestScoreDisplay = document.getElementById("mgBest");

    // ====================================================================================
    // 5) GAME DATA (icons + names used to build card deck)
    // ====================================================================================
    const GAME_DATA = [
        { name: "Python", icon: '<i class="bi bi-filetype-py"></i>' },
        { name: "SQL", icon: '<i class="bi bi-database"></i>' },
        { name: "ML", icon: '<i class="bi bi-robot"></i>' },
        { name: "Tableau", icon: '<i class="bi bi-bar-chart-fill"></i>' },
        { name: "Docker", icon: '<i class="bi bi-box"></i>' },
        { name: "Git", icon: '<i class="bi bi-git"></i>' },
        { name: "Cloud", icon: '<i class="bi bi-cloud-fill"></i>' },
        { name: "Excel", icon: '<i class="bi bi-file-earmark-excel"></i>' },
        { name: "Code", icon: '<i class="bi bi-code-slash"></i>' },
        { name: "Terminal", icon: '<i class="bi bi-terminal-fill"></i>' },
        { name: "CPU", icon: '<i class="bi bi-cpu-fill"></i>' },
        { name: "Diagram", icon: '<i class="bi bi-diagram-3-fill"></i>' },
    ];

    // ====================================================================================
    // 6) DIFFICULTY SETTINGS (how many rows/columns/pairs)
    // ====================================================================================
    const DIFFICULTIES = {
        easy: { cols: 4, rows: 3, pairs: 6 },
        hard: { cols: 6, rows: 4, pairs: 12 },
    };

    // ====================================================================================
    // 7) GAME STATE OBJECT (stores everything about current game)
    // ====================================================================================
    const state = {
        difficulty: difficultySelector.value || "easy",
        deck: [],       // card objects
        moves: 0,
        matches: 0,
        firstCard: null,
        secondCard: null,
        lockBoard: false,
        gameStarted: false,
        paused: false,

        timerInterval: null,
        startTime: 0,
        elapsedMs: 0,

        bestScores: { easy: null, hard: null },
    };

    // Format seconds to mm:ss
    const formatTime = (s) =>
        `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

    // Fisher-Yates shuffle
    const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    };

    // Update moves + matches under the game
    const updateStats = () => {
        const pairs = DIFFICULTIES[state.difficulty].pairs;
        if (movesDisplay) movesDisplay.textContent = String(state.moves);
        if (matchesDisplay) matchesDisplay.textContent = `${state.matches}/${pairs}`;
    };

    // Update best score section
    const updateBestScoreDisplay = () => {
        if (!bestScoreDisplay) return;
        const easy = state.bestScores.easy ?? "—";
        const hard = state.bestScores.hard ?? "—";
        bestScoreDisplay.innerHTML =
            `Best Easy: <strong>${easy === "—" ? "—" : `${easy} moves`}</strong> | ` +
            `Best Hard: <strong>${hard === "—" ? "—" : `${hard} moves`}</strong>`;
    };

    // Load best scores from localStorage
    const loadBestScores = () => {
        const easy = localStorage.getItem("mgBestMoves_easy");
        const hard = localStorage.getItem("mgBestMoves_hard");
        state.bestScores.easy = easy ? Number(easy) : null;
        state.bestScores.hard = hard ? Number(hard) : null;
        updateBestScoreDisplay();
    };

    // Update localStorage if new best score achieved
    const maybeUpdateBestScore = () => {
        const mode = state.difficulty;
        const best = state.bestScores[mode];

        // If no previous best OR new is smaller → save it
        if (best === null || state.moves < best) {
            state.bestScores[mode] = state.moves;
            localStorage.setItem(`mgBestMoves_${mode}`, String(state.moves));
            updateBestScoreDisplay();
        }
    };

    // ====================================================================================
    // 8) TIMER FUNCTIONS (supports pause/resume)
    // ====================================================================================
    const tickTimer = () => {
        const totalMs = state.elapsedMs + (Date.now() - state.startTime);
        const s = Math.floor(totalMs / 1000);
        if (timeDisplay) timeDisplay.textContent = formatTime(s);
    };

    const startTimer = () => {
        state.startTime = Date.now();
        tickTimer();
        state.timerInterval = setInterval(tickTimer, 1000);
    };

    const stopTimer = () => {
        if (!state.timerInterval) return;
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        state.elapsedMs += Date.now() - state.startTime;
    };

    const resetTimer = () => {
        stopTimer();
        state.elapsedMs = 0;
        if (timeDisplay) timeDisplay.textContent = "00:00";
    };

    const hideWin = () => winMessage.classList.remove("is-show");
    const showWin = () => winMessage.classList.add("is-show");

    // ====================================================================================
    // 9) DECK GENERATION (select icons, duplicate, shuffle)
    // ====================================================================================
    const generateDeck = () => {
        const pairs = DIFFICULTIES[state.difficulty].pairs;

        const pool = [...GAME_DATA];
        shuffle(pool);

        // Select only as many icons as needed for the chosen difficulty
        const chosen = pool.slice(0, pairs);

        // Duplicate + shuffle
        const deck = [...chosen, ...chosen].map((x) => ({ ...x }));
        shuffle(deck);
        return deck;
    };

    // ====================================================================================
    // 10) RENDER BOARD (create card HTML)
    // ====================================================================================
    const renderBoard = () => {
        const { cols } = DIFFICULTIES[state.difficulty];
        board.dataset.difficulty = state.difficulty;
        board.style.gridTemplateColumns = `repeat(${cols}, var(--mg-card))`;

        board.innerHTML = state.deck
            .map((item, idx) => `
                <div class="mg-card" data-index="${idx}">
                  <div class="mg-card-inner">
                    <div class="mg-card-front"></div>
                    <div class="mg-card-back">${item.icon}</div>
                  </div>
                </div>
            `)
            .join("");
    };

    // Reset flip tracking
    const resetFlipState = () => {
        state.firstCard = null;
        state.secondCard = null;
        state.lockBoard = false;
    };

    // ====================================================================================
    // 11) END GAME
    // ====================================================================================
    const endGame = () => {
        stopTimer();
        state.gameStarted = false;
        state.paused = false;

        board.classList.add("is-disabled");
        pauseBtn.disabled = true;
        pauseBtn.textContent = "Pause";
        startBtn.disabled = false;

        showWin();
        maybeUpdateBestScore();
    };

    // ====================================================================================
    // 12) MATCH CHECKING LOGIC
    // ====================================================================================
    const checkMatch = () => {
        const i1 = Number(state.firstCard.dataset.index);
        const i2 = Number(state.secondCard.dataset.index);

        // If names match → correct pair
        if (state.deck[i1].name === state.deck[i2].name) {
            state.matches++;
            state.firstCard.classList.add("is-matched");
            state.secondCard.classList.add("is-matched");

            updateStats();
            resetFlipState();

            // All pairs matched → end game
            if (state.matches === DIFFICULTIES[state.difficulty].pairs) endGame();
        } else {
            // Wrong pair → flip back after delay
            state.lockBoard = true;
            setTimeout(() => {
                state.firstCard.classList.remove("is-flipped");
                state.secondCard.classList.remove("is-flipped");
                resetFlipState();
            }, 900);
        }
    };

    // ====================================================================================
    // 13) FLIP CARD FUNCTION (called when user clicks a card)
    // ====================================================================================
    const flipCard = (card) => {
        if (!state.gameStarted) return;
        if (state.paused) return;
        if (state.lockBoard) return;
        if (card.classList.contains("is-matched")) return;
        if (card.classList.contains("is-flipped")) return;

        card.classList.add("is-flipped");

        // First card selected
        if (!state.firstCard) {
            state.firstCard = card;
            return;
        }

        // Second card selected
        state.secondCard = card;
        state.moves++;
        updateStats();
        checkMatch();
    };

    // Clicking on the board triggers flip
    board.addEventListener("click", (e) => {
        const card = e.target.closest(".mg-card");
        if (!card) return;
        if (board.classList.contains("is-disabled")) return;
        flipCard(card);
    });

    // ====================================================================================
    // 14) GAME PREPARATION (used when difficulty changes or restart)
    // ====================================================================================
    const prepareGame = () => {
        hideWin();
        resetTimer();

        state.moves = 0;
        state.matches = 0;
        state.gameStarted = false;
        state.paused = false;
        resetFlipState();
        updateStats();

        state.deck = generateDeck();
        renderBoard();

        board.classList.add("is-disabled");
        startBtn.disabled = false;
        restartBtn.disabled = true;

        pauseBtn.disabled = true;
        pauseBtn.textContent = "Pause";
    };

    // ====================================================================================
    // 15) START GAME
    // ====================================================================================
    const startGame = () => {
        hideWin();
        resetTimer();

        state.moves = 0;
        state.matches = 0;
        state.gameStarted = true;
        state.paused = false;
        resetFlipState();
        updateStats();

        state.deck = generateDeck();
        renderBoard();

        board.classList.remove("is-disabled");
        startBtn.disabled = true;
        restartBtn.disabled = false;

        pauseBtn.disabled = false;
        pauseBtn.textContent = "Pause";

        startTimer();
    };

    // Pause / Resume logic
    const pauseGame = () => {
        if (!state.gameStarted || state.paused) return;
        state.paused = true;
        stopTimer();
        board.classList.add("is-disabled");
        pauseBtn.textContent = "Resume";
    };

    const resumeGame = () => {
        if (!state.gameStarted || !state.paused) return;
        state.paused = false;
        board.classList.remove("is-disabled");
        pauseBtn.textContent = "Pause";
        startTimer();
    };

    // ====================================================================================
    // 16) BUTTON EVENT LISTENERS
    // ====================================================================================
    startBtn.addEventListener("click", (e) => {
        e.preventDefault();
        startGame();
    });

    restartBtn.addEventListener("click", (e) => {
        e.preventDefault();
        startGame();
    });

    pauseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        state.paused ? resumeGame() : pauseGame();
    });

    // Change difficulty regenerates deck
    difficultySelector.addEventListener("change", (e) => {
        state.difficulty = e.target.value;
        prepareGame();
    });

    // Load stored best scores + prepare initial board
    loadBestScores();
    prepareGame();
});


