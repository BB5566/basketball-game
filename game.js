/**
 * 投籃機遊戲 - 主要遊戲邏輯 (優化版)
 * 功能：三關卡投籃遊戲，包含移動籃框、特效系統、分數計算等
 * 優化：效能優化、資源管理、教學系統、錯誤處理
 */

// ========== 遊戲配置常數 ==========
const GAME_CONFIG = {
  INITIAL_TIME: 150,
  LEVEL_THRESHOLDS: { 1: 15, 2: 35 },
  SCORE_SETTINGS: {
    BASE_POINTS: 10,
    COMBO_MULTIPLIER: 3,
    LEVEL_BONUS_MULTIPLIER: 2
  },
  BASKET_RANGES: {
    1: 380,
    2: 280,
    3: 230
  },
  BASKET_MOVEMENT: {
    2: { speed: 0.6, range: 15 },
    3: { speed: 0.9, range: 25 }
  },
  PHYSICS: {
    MIN_FLIGHT_TIME: 700,
    MAX_FLIGHT_TIME: 1400,
    FLIGHT_TIME_MULTIPLIER: 2.5,
    MIN_PEAK_HEIGHT: 120,
    MAX_PEAK_HEIGHT: 350,
    PEAK_HEIGHT_POWER_MULTIPLIER: 2.5,
    PEAK_HEIGHT_DISTANCE_MULTIPLIER: 0.4
  },
  SOUND_VOLUME: 0.3,
  COMBO_TIMEOUT: 3000,
  MIN_DRAG_DISTANCE: 20
};

// ========== 遊戲狀態管理 ==========
class GameState {
  constructor() {
    this.score = 0;
    this.topScore = localStorage.getItem("topScore") || 0;
    this.timeLeft = GAME_CONFIG.INITIAL_TIME;
    this.gameActive = false;
    this.gameTimer = null;
    this.currentLevel = 1;
    this.consecutiveHits = 0;
    this.lastHitTime = 0;
    this.basketMoving = false;
    this.achievements = this.loadAchievements();
    this.stats = {
      totalShots: 0,
      successfulShots: 0,
      maxCombo: 0,
      maxScore: 0
    };
  }

  loadAchievements() {
    const saved = localStorage.getItem("achievements");
    return saved ? JSON.parse(saved) : {
      firstScore: false,
      combo5: false,
      combo10: false,
      level2: false,
      level3: false,
      score50: false,
      score100: false,
      perfectShooter: false
    };
  }

  saveAchievements() {
    localStorage.setItem("achievements", JSON.stringify(this.achievements));
  }

  checkAchievement(type, value) {
    const achievements = {
      firstScore: { condition: () => this.stats.successfulShots === 1, title: "🎯 首次得分", desc: "完成第一次投籃得分" },
      combo5: { condition: () => value >= 5, title: "🔥 連擊高手", desc: "達成5連擊" },
      combo10: { condition: () => value >= 10, title: "⚡ 連擊大師", desc: "達成10連擊" },
      level2: { condition: () => this.currentLevel >= 2, title: "🏆 晉級達人", desc: "達到第2關" },
      level3: { condition: () => this.currentLevel >= 3, title: "👑 終極挑戰者", desc: "達到第3關" },
      score50: { condition: () => this.score >= 50, title: "💯 得分高手", desc: "累積50分" },
      score100: { condition: () => this.score >= 100, title: "🌟 得分大師", desc: "累積100分" },
      perfectShooter: { condition: () => this.stats.successfulShots >= 10 && (this.stats.successfulShots / this.stats.totalShots) >= 0.8, title: "🎖️ 神射手", desc: "命中率達80%（至少10次投籃）" }
    };

    if (achievements[type] && !this.achievements[type] && achievements[type].condition()) {
      this.achievements[type] = true;
      this.saveAchievements();
      this.showAchievementNotification(achievements[type].title, achievements[type].desc);
      return true;
    }
    return false;
  }

  showAchievementNotification(title, desc) {
    const notification = $(`
      <div class="achievement-notification">
        <div class="achievement-icon">🏅</div>
        <div class="achievement-text">
          <div class="achievement-title">${title}</div>
          <div class="achievement-desc">${desc}</div>
        </div>
      </div>
    `);

    $("body").append(notification);

    setTimeout(() => {
      notification.addClass("show");
    }, 100);

    setTimeout(() => {
      notification.removeClass("show");
      setTimeout(() => notification.remove(), 500);
    }, 3500);
  }

  reset() {
    this.score = 0;
    this.timeLeft = GAME_CONFIG.INITIAL_TIME;
    this.currentLevel = 1;
    this.basketMoving = false;
    this.consecutiveHits = 0;
    this.gameActive = false;
    this.stats.totalShots = 0;
    this.stats.successfulShots = 0;
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
  }

  updateTopScore() {
    if (this.score > this.topScore) {
      this.topScore = this.score;
      localStorage.setItem("topScore", this.topScore);
      return true;
    }
    return false;
  }
}

// ========== 球物理引擎 ==========
class BallPhysics {
  constructor() {
    this.ballOriginalPos = { x: "50%", y: "70%" };
  }

  /**
   * 計算拋物線軌跡參數
   * @returns {object} 包含飛行時間和頂點座標的物件
   */
  calculateTrajectory(startX, startY, targetX, targetY, power, distance) {
    const cfg = GAME_CONFIG.PHYSICS;
    const flightTime = Math.max(
      cfg.MIN_FLIGHT_TIME,
      Math.min(cfg.MAX_FLIGHT_TIME, distance * cfg.FLIGHT_TIME_MULTIPLIER)
    );
    const peakHeight = Math.max(
      cfg.MIN_PEAK_HEIGHT,
      Math.min(
        cfg.MAX_PEAK_HEIGHT,
        power * cfg.PEAK_HEIGHT_POWER_MULTIPLIER + distance * cfg.PEAK_HEIGHT_DISTANCE_MULTIPLIER
      )
    );

    return {
      flightTime,
      peakHeight,
      midX: startX + (targetX - startX) * 0.5,
      midY: Math.min(startY, targetY) - peakHeight,
    };
  }

  /**
   * 檢查投籃目標是否在籃框的有效範圍內
   * @returns {boolean}
   */
  isWithinBasketRange(targetX, targetY, basketCenterX, basketCenterY, level) {
    const distance = Math.sqrt(
      Math.pow(targetX - basketCenterX, 2) +
        Math.pow(targetY - basketCenterY, 2)
    );
    return distance <= (GAME_CONFIG.BASKET_RANGES[level] || 260);
  }

  /**
   * 檢查球是否命中籃框
   * @returns {boolean}
   */
  checkBasketHit(ballX, ballY) {
    const basketIn = $("#basket-in");
    const basketInRect = basketIn[0].getBoundingClientRect();
    const containerRect = $(".container")[0].getBoundingClientRect();

    const basketLeft = basketInRect.left - containerRect.left;
    const basketRight = basketLeft + basketInRect.width;
    const basketTop = basketInRect.top - containerRect.top;
    const basketHeight = basketInRect.height;

    // 水平判定：球心需在籃框圖片內
    if (ballX < basketLeft || ballX > basketRight) {
      return false;
    }

    // 垂直判定：放寬容錯範圍至上下各30%
    const tolerance = basketHeight * 0.3;
    const minY = basketTop - tolerance;
    const maxY = basketTop + tolerance;

    return ballY >= minY && ballY <= maxY;
  }
}

// ========== 特效系統 ==========
class EffectSystem {
  static showScorePopup(points, x, y) {
    const popup = $(`<div class="score-popup">+${points}</div>`);
    popup.css({
      left: x - 20 + "px",
      top: y - 20 + "px",
    });
    $(".container").append(popup);

    setTimeout(() => popup.remove(), 1200);
  }

  static showComboEffect(combo, x, y) {
    if (combo < 2) return;

    const comboText = $(`<div class="combo-text">COMBO x${combo}!</div>`);
    comboText.css({
      left: x - 50 + "px",
      top: y - 80 + "px",
    });
    $(".container").append(comboText);

    setTimeout(() => comboText.remove(), 1000);
  }

  static showSuccessEffect(x, y) {
    // 光圈效果
    const ripple = $('<div class="success-ripple"></div>');
    ripple.css({
      position: "absolute",
      left: x - 30 + "px",
      top: y - 30 + "px",
      width: "60px",
      height: "60px",
      border: "4px solid #4CAF50",
      borderRadius: "50%",
      animation: "rippleEffect 0.8s ease-out forwards",
      pointerEvents: "none",
      zIndex: 200,
    });
    $(".container").append(ripple);

    // 螢幕閃爍
    const flash = $('<div class="screen-flash"></div>');
    $("body").append(flash);

    setTimeout(() => {
      ripple.remove();
      flash.remove();
    }, 800);
  }

  static createBallTrail(x, y) {
    const trail = $('<div class="ball-trail"></div>');
    trail.css({
      left: x - 30 + "px",
      top: y - 30 + "px",
    });
    $(".container").append(trail);

    setTimeout(() => trail.remove(), 500);
  }

  static showLevelUpMessage(level) {
    const messages = {
      2: "🎯 LEVEL 2 - 籃框開始移動！",
      3: "🔥 LEVEL 3 - 移動加速！",
    };

    const message = messages[level] || "LEVEL UP!";
    const levelUpText = $(
      `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 28px; font-weight: bold; color: #FFD700; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); z-index: 200; animation: levelUpFloat 2.5s ease-out forwards; text-align: center;">${message}</div>`
    );
    $(".container").append(levelUpText);

    // 升級閃光效果
    const flash = $(
      '<div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 215, 0, 0.3); pointer-events: none; z-index: 199; animation: screenFlash 0.5s ease-out forwards;"></div>'
    );
    $("body").append(flash);

    setTimeout(() => {
      levelUpText.remove();
      flash.remove();
    }, 2500);
  }
}

// ========== 籃框控制器 ==========
class BasketController {
  constructor() {
    this.animationFrame = null;
    this.direction = 1;
    this.currentOffset = 0;
    this.lastTimestamp = 0;
  }

  startMovement(level) {
    if (this.animationFrame) return;

    const basket = $(".baseket");
    const basketIn = $("#basket-in");
    const basketArea = $("#basket-area");

    const config = GAME_CONFIG.BASKET_MOVEMENT[level] || GAME_CONFIG.BASKET_MOVEMENT[2];
    const { speed, range } = config;

    const animate = (timestamp) => {
      if (!this.lastTimestamp) this.lastTimestamp = timestamp;
      const delta = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;

      // 使用時間增量讓動畫更流暢（60fps 標準）
      const normalizedSpeed = speed * (delta / 16.67);
      this.currentOffset += this.direction * normalizedSpeed;

      if (Math.abs(this.currentOffset) >= range) {
        this.direction *= -1;
        this.currentOffset = Math.sign(this.currentOffset) * range;
      }

      const newTransform = `translate(calc(-50% + ${this.currentOffset}%), -50%)`;
      basket.css("transform", newTransform);
      basketIn.css("transform", newTransform);
      basketArea.css("transform", newTransform);

      this.animationFrame = requestAnimationFrame(animate);
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  stopMovement() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    const resetTransform = "translate(-50%, -50%)";
    $(".baseket, #basket-in, #basket-area").css("transform", resetTransform);

    this.currentOffset = 0;
    this.direction = 1;
    this.lastTimestamp = 0;
  }

  cleanup() {
    this.stopMovement();
  }

  updateSize(level) {
    const basket = $(".baseket");
    const basketIn = $("#basket-in");

    if (level === 1) {
      basket.addClass("level-1");
      basketIn.addClass("level-1");
    } else {
      basket.removeClass("level-1");
      basketIn.removeClass("level-1");
    }
  }

  shake(isMoving = false) {
    const basket = $(".baseket");
    const basketIn = $("#basket-in");
    const animationName = isMoving ? "basketShakeMoving" : "basketShake";

    const currentTransform = basket.css("transform");
    basket.add(basketIn).css({
      "--current-transform": currentTransform,
      animation: `${animationName} 0.5s ease-in-out`,
    });

    setTimeout(() => {
      basket.add(basketIn).css("animation", "");
      basketIn.removeClass("show");
      // 確保 transform 屬性在動畫結束後保持同步
      basketIn.css("transform", basket.css("transform"));
    }, 500);
  }
}

// ========== 教學系統 ==========
class TutorialSystem {
  constructor() {
    this.shown = localStorage.getItem('tutorialShown') === 'true';
  }

  show() {
    if (this.shown) return;

    const tutorial = $(`
      <div class="tutorial-overlay">
        <div class="tutorial-content">
          <h2>🏀 遊戲教學</h2>
          <div class="tutorial-steps">
            <div class="tutorial-step">
              <span class="step-icon">👆</span>
              <p><strong>拖拽投球</strong><br>按住籃球向下拖拽</p>
            </div>
            <div class="tutorial-step">
              <span class="step-icon">🎯</span>
              <p><strong>瞄準籃框</strong><br>拖拽方向相反處即為投球方向</p>
            </div>
            <div class="tutorial-step">
              <span class="step-icon">💪</span>
              <p><strong>控制力度</strong><br>拖拽越遠，投球力度越大</p>
            </div>
            <div class="tutorial-step">
              <span class="step-icon">🔥</span>
              <p><strong>連擊獎勵</strong><br>連續命中可獲得額外分數</p>
            </div>
          </div>
          <button class="tutorial-close-btn">開始遊戲</button>
          <label class="tutorial-checkbox">
            <input type="checkbox" id="dont-show-again"> 不再顯示
          </label>
        </div>
      </div>
    `);

    $('body').append(tutorial);

    setTimeout(() => tutorial.addClass('show'), 100);

    tutorial.find('.tutorial-close-btn').on('click', () => {
      if ($('#dont-show-again').is(':checked')) {
        localStorage.setItem('tutorialShown', 'true');
        this.shown = true;
      }
      tutorial.removeClass('show');
      setTimeout(() => tutorial.remove(), 300);
    });
  }

  reset() {
    localStorage.removeItem('tutorialShown');
    this.shown = false;
  }
}

// ========== 主遊戲類 ==========
class BasketballGame {
  constructor() {
    this.state = new GameState();
    this.physics = new BallPhysics();
    this.basketController = new BasketController();
    this.tutorial = new TutorialSystem();
    this.isDragging = false;
    this.startPos = { x: 0, y: 0 };
    this.powerLevel = 0;
    this.boundaryCheckInterval = null;

    // 初始化音效系統
    this.sounds = {};
    this.initSounds();

    this.init();
  }

  initSounds() {
    const soundUrls = {
      shoot: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
      score: 'https://assets.mixkit.co/active_storage/sfx/1434/1434-preview.mp3',
      miss: 'https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3',
      levelUp: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'
    };

    Object.entries(soundUrls).forEach(([name, url]) => {
      try {
        const audio = new Audio(url);
        audio.volume = GAME_CONFIG.SOUND_VOLUME;
        audio.preload = 'auto';
        audio.addEventListener('error', () => {
          console.warn(`Failed to load sound: ${name}`);
          this.sounds[name] = null;
        });
        this.sounds[name] = audio;
      } catch (e) {
        console.warn(`Error initializing sound: ${name}`, e);
        this.sounds[name] = null;
      }
    });
  }

  playSound(soundName) {
    const sound = this.sounds[soundName];
    if (sound) {
      try {
        sound.currentTime = 0;
        sound.play().catch(e => console.warn(`Audio play failed for ${soundName}:`, e));
      } catch (e) {
        console.warn(`Error playing sound ${soundName}:`, e);
      }
    }
  }

  init() {
    this.updateUI();
    this.setupEventListeners();
    this.startGameTimer();
    $('#guide-line').hide();

    // 顯示教學
    setTimeout(() => this.tutorial.show(), 500);
  }

  updateUI() {
    $("#score").text(this.state.score);
    $("#timer").text(this.state.timeLeft);
    $("#level").text(this.state.currentLevel);
    $("#top-score").text(this.state.topScore);
    this.basketController.updateSize(this.state.currentLevel);
  }

  setupEventListeners() {
    const $ball = $("#ball");
    const $doc = $(document);

    $ball.on("mousedown.game touchstart.game", (e) => this.handleBallStart(e));
    $doc.on("mousemove.game touchmove.game", (e) => this.handleBallMove(e));
    $doc.on("mouseup.game touchend.game", (e) => this.handleBallEnd(e));
    $doc.on("dragstart.game", (e) => e.preventDefault());

    window.restartGame = () => this.restart();
  }

  cleanup() {
    // 清理所有事件監聽器
    $("#ball").off(".game");
    $(document).off(".game");

    // 清理計時器和動畫
    if (this.state.gameTimer) {
      clearInterval(this.state.gameTimer);
    }
    if (this.boundaryCheckInterval) {
      clearInterval(this.boundaryCheckInterval);
    }

    // 清理籃框動畫
    this.basketController.cleanup();

    // 清理音效
    Object.values(this.sounds).forEach(sound => {
      if (sound) {
        sound.pause();
        sound.currentTime = 0;
      }
    });
  }

  startGameTimer() {
    this.state.gameActive = true;
    this.state.gameTimer = setInterval(() => {
      this.state.timeLeft--;
      $("#timer").text(this.state.timeLeft);

      if (this.state.timeLeft <= 0) {
        this.endGame();
      }
    }, 1000);
  }

  endGame() {
    this.state.gameActive = false;
    if (this.state.gameTimer) clearInterval(this.state.gameTimer);
    this.basketController.stopMovement();

    this.state.updateTopScore();

    $("#final-score").text(this.state.score);
    $("#final-top-score").text(this.state.topScore);
    $("#game-over-modal").css("display", "flex");
  }

  restart() {
    this.state.reset();
    this.basketController.stopMovement();
    this.resetBallPosition();
    $("#game-over-modal").hide();
    this.updateUI();
    this.startGameTimer();
  }

  checkLevelUp() {
    const threshold = GAME_CONFIG.LEVEL_THRESHOLDS[this.state.currentLevel];

    if (threshold && this.state.score >= threshold) {
      this.state.currentLevel++;
      this.basketController.updateSize(this.state.currentLevel);
      $("#level").text(this.state.currentLevel);
      EffectSystem.showLevelUpMessage(this.state.currentLevel);

      if (this.state.currentLevel > 1) {
        $('.title').hide();
      }

      if (this.state.currentLevel >= 2) {
        this.state.basketMoving = true;
        this.basketController.startMovement(this.state.currentLevel);
      }

      this.playSound('levelUp');

      this.state.checkAchievement('level2');
      this.state.checkAchievement('level3');
    }
  }

  /**
   * 計算得分
   * @returns {number}
   */
  calculateScore() {
    const cfg = GAME_CONFIG.SCORE_SETTINGS;
    const comboBonus = Math.max(0, (this.state.consecutiveHits - 1) * cfg.COMBO_MULTIPLIER);
    const levelBonus = (this.state.currentLevel - 1) * cfg.LEVEL_BONUS_MULTIPLIER;
    return cfg.BASE_POINTS + comboBonus + levelBonus;
  }

  handleBasketHit(ballX, ballY) {
    const basket = $(".baseket");
    const basketIn = $("#basket-in");

    // 讓球在籃框和特效之間，實現入網效果
    $("#ball").css("z-index", 18);

    basketIn.css("transform", basket.css("transform")).addClass("show");

    const basketRect = basket[0].getBoundingClientRect();
    const containerRect = $(".container")[0].getBoundingClientRect();
    const basketCenterX =
      basketRect.left - containerRect.left + basketRect.width / 2;
    const basketCenterY =
      basketRect.top - containerRect.top + basketRect.height / 2;

    this.animateBallIntoBasket(basketCenterX, basketCenterY);

    const currentTime = Date.now();
    this.state.consecutiveHits =
      currentTime - this.state.lastHitTime < GAME_CONFIG.COMBO_TIMEOUT
        ? this.state.consecutiveHits + 1
        : 1;
    this.state.lastHitTime = currentTime;

    // 更新統計數據
    this.state.stats.successfulShots++;
    this.state.stats.maxCombo = Math.max(this.state.stats.maxCombo, this.state.consecutiveHits);

    const points = this.calculateScore();
    this.state.score += points;
    this.state.stats.maxScore = Math.max(this.state.stats.maxScore, this.state.score);
    $("#score").text(this.state.score);

    EffectSystem.showScorePopup(points, basketCenterX, basketCenterY);
    EffectSystem.showComboEffect(
      this.state.consecutiveHits,
      basketCenterX,
      basketCenterY - 100
    );
    EffectSystem.showSuccessEffect(basketCenterX, basketCenterY);
    // 隱藏導引線並立即重置球位置
    $('#guide-line').hide();
    this.resetBallPosition();

    this.basketController.shake(this.state.basketMoving);

    // 播放得分音效
    this.playSound('score');

    // 檢查成就
    this.state.checkAchievement('firstScore');
    this.state.checkAchievement('combo5', this.state.consecutiveHits);
    this.state.checkAchievement('combo10', this.state.consecutiveHits);
    this.state.checkAchievement('score50');
    this.state.checkAchievement('score100');
    this.state.checkAchievement('perfectShooter');

    this.checkLevelUp();

  }

  /**
   * 執行球入籃框的動畫序列
   */
  animateBallIntoBasket(centerX, centerY) {
    const ball = $("#ball");
    const deskRect = $(".desk")[0].getBoundingClientRect();
    const containerRect = $(".container")[0].getBoundingClientRect();
    const deskTopY = deskRect.top - containerRect.top;

    // 定義動畫序列
    const sequence = [
      {
        delay: 0,
        duration: 300,
        css: {
          top: centerY - 20 + "px",
          transform: "scale(0.9) rotate(360deg)",
        },
      },
      {
        delay: 300,
        duration: 200,
        css: { transform: "scale(0.8) rotate(540deg)" },
      },
      {
        delay: 500,
        duration: 400,
        css: {
          top: centerY + 80 + "px",
          transform: "scale(0.7) rotate(720deg)",
        },
      },
      {
        delay: 900,
        duration: 500,
        css: {
          top: deskTopY - 40 + "px",
          transform: "scale(0.6) rotate(900deg)",
          opacity: 0.8,
        },
      },
      {
        delay: 1400,
        duration: 200,
        css: { transform: "scale(0.7) rotate(1080deg)" },
      },
      {
        delay: 1600,
        duration: 200,
        css: { transform: "scale(0.6) rotate(1080deg)", opacity: 0.9 },
      },
    ];

    // 執行動畫
    sequence.forEach((step) => {
      setTimeout(() => {
        ball.css({
          transition: `all ${step.duration}ms ease-in-out`,
          ...step.css,
        });
      }, step.delay);
    });
  }

  shootBall(targetX, targetY, power) {
    if (!this.state.gameActive) return;

    // 記錄投籃次數
    this.state.stats.totalShots++;

    const ball = $("#ball");
    const ballRect = ball[0].getBoundingClientRect();
    const containerRect = $(".container")[0].getBoundingClientRect();

    const startX = ballRect.left - containerRect.left + ballRect.width / 2;
    const startY = ballRect.top - containerRect.top + ballRect.height / 2;

    ball.addClass("shooting");

    const basketRect = $(".baseket")[0].getBoundingClientRect();
    const basketCenterX =
      basketRect.left - containerRect.left + basketRect.width / 2;
    const basketCenterY =
      basketRect.top - containerRect.top + basketRect.height / 2;

    if (
      !this.physics.isWithinBasketRange(
        targetX,
        targetY,
        basketCenterX,
        basketCenterY,
        this.state.currentLevel
      )
    ) {
      this.handleDirectDrop(targetX, targetY);
      return;
    }

    this.executeParabolicShot(startX, startY, targetX, targetY, power);
  }

  executeParabolicShot(startX, startY, targetX, targetY, power) {
    const ball = $("#ball");
    const containerRect = $(".container")[0].getBoundingClientRect();
    const distance = Math.sqrt(
      Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2)
    );
    const trajectory = this.physics.calculateTrajectory(
      startX,
      startY,
      targetX,
      targetY,
      power,
      distance
    );

    // 播放投籃音效
    this.playSound('shoot');

    ball.css({
      transition: `all ${trajectory.flightTime}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
      left: targetX - 40 + "px",
      top: targetY - 40 + "px",
      transform: `translate(0, 0) rotate(${power * 3}deg) scale(0.8)`,
    });

    // 使用 requestAnimationFrame 檢查邊界
    const checkBoundary = () => {
      if (this.isBallOutOfBounds(ball, containerRect)) {
        this.handleBallOutOfBounds();
        return;
      }
      this.boundaryCheckInterval = requestAnimationFrame(checkBoundary);
    };
    this.boundaryCheckInterval = requestAnimationFrame(checkBoundary);

    setTimeout(() => {
      if (ball.css("opacity") === "0") return;
      ball.css("transform", `translate(0, 0) rotate(${power * 6}deg) scale(1)`);
      const ballRect = ball[0].getBoundingClientRect();
      EffectSystem.createBallTrail(
        ballRect.left - containerRect.left + ballRect.width / 2,
        ballRect.top - containerRect.top + ballRect.height / 2
      );
    }, trajectory.flightTime * 0.3);

    setTimeout(() => {
      if (this.boundaryCheckInterval) {
        cancelAnimationFrame(this.boundaryCheckInterval);
        this.boundaryCheckInterval = null;
      }
      this.checkShotResult(ball, containerRect);
    }, trajectory.flightTime);
  }

  checkShotResult(ball, containerRect) {
    if (ball.css("opacity") === "0") return;

    const ballRect = ball[0].getBoundingClientRect();
    const ballCenterX = ballRect.left - containerRect.left + ballRect.width / 2;
    const ballCenterY = ballRect.top - containerRect.top + ballRect.height / 2;

    if (this.isBallOutOfBounds(ball, containerRect)) {
      this.handleBallOutOfBounds();
      return;
    }

    if (this.physics.checkBasketHit(ballCenterX, ballCenterY)) {
      this.handleBasketHit(ballCenterX, ballCenterY);
    } else {
      this.handleMissedShot();
    }
  }

  handleMissedShot() {
    this.state.consecutiveHits = 0;

    // 播放失誤音效
    this.playSound('miss');

    const ball = $("#ball");
    const containerRect = $(".container")[0].getBoundingClientRect();
    const deskRect = $(".desk")[0].getBoundingClientRect();
    const deskTopY = deskRect.top - containerRect.top;

    ball.css({
      transition: "all 0.6s ease-in",
      top: deskTopY - 40 + "px",
      transform: `translate(0, 0) rotate(${this.powerLevel * 4}deg) scale(0.8)`,
      opacity: "0.8",
    });

    setTimeout(() => this.resetBallPosition(), 1000);
  }

  handleDirectDrop(targetX, targetY) {
    const ball = $("#ball");
    const containerRect = $(".container")[0].getBoundingClientRect();

    if (
      targetX < 0 ||
      targetX > containerRect.width ||
      targetY < 0 ||
      targetY > containerRect.height
    ) {
      this.handleBallOutOfBounds();
      return;
    }

    const deskRect = $(".desk")[0].getBoundingClientRect();
    const deskTopY = deskRect.top - containerRect.top;

    ball.css({
      transition: "all 0.8s ease-in",
      left: targetX - 40 + "px",
      top: deskTopY - 40 + "px",
      transform: "translate(0, 0) rotate(360deg) scale(0.8)",
      opacity: "0.7",
    });

    setTimeout(() => this.resetBallPosition(), 1200);
  }

  isBallOutOfBounds(ball, containerRect) {
    const ballRect = ball[0].getBoundingClientRect();
    const ballX = ballRect.left - containerRect.left + ballRect.width / 2;
    const ballY = ballRect.top - containerRect.top + ballRect.height / 2;

    return (
      ballX < -20 ||
      ballX > containerRect.width + 20 ||
      ballY < -20 ||
      ballY > containerRect.height + 20
    );
  }

  handleBallOutOfBounds() {
    $("#ball")
      .stop(true, true)
      .css({
        opacity: "0",
        transition: "none",
        animation: "none",
      })
      .removeClass("shooting");

    setTimeout(() => this.resetBallPosition(), 200);
  }

  resetBallPosition() {
    $("#ball").removeClass("shooting").css({
      top: this.physics.ballOriginalPos.y,
      left: this.physics.ballOriginalPos.x,
      transform: "translate(-50%, -50%)",
      transition: "all 0.3s ease",
      opacity: "1",
      "z-index": 15, // 恢復球的 z-index
    });
  }

  // ========== 事件處理 (簡化版) ==========
  handleBallStart(e) {
    if (!this.state.gameActive) return;

    e.preventDefault();
    this.isDragging = true;

    const clientX = e.type === 'touchstart' ? e.originalEvent.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.originalEvent.touches[0].clientY : e.clientY;

    this.startPos = { x: clientX, y: clientY };
    $('#ball').addClass('dragging');

    // 顯示力度條
    this.powerLevel = 0;
    $('#power-bar').css('width', '0%');
    $('#power-indicator').show();

    // 顯示拋物線預覽
    $('#guide-line').show();
  }

  handleBallMove(e) {
    if (!this.isDragging || !this.state.gameActive) return;

    e.preventDefault();
    const clientX = e.type === 'touchmove' ? e.originalEvent.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.originalEvent.touches[0].clientY : e.clientY;

    const deltaX = clientX - this.startPos.x;
    const deltaY = clientY - this.startPos.y;

    // 力度完全由拖拽距離決定
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    this.powerLevel = Math.min(100, distance / 2); // 除以2來調整靈敏度
    $('#power-bar').css('width', this.powerLevel + '%');

    // 計算並更新拋物線路徑預覽
    const ballRect = $('#ball')[0].getBoundingClientRect();
    const containerRect = $('.container')[0].getBoundingClientRect();
    const startX = ballRect.left - containerRect.left + ballRect.width / 2;
    const startY = ballRect.top - containerRect.top + ballRect.height / 2;
    let targetX = this.startPos.x - containerRect.left - deltaX * 2;
    let targetY = this.startPos.y - containerRect.top - deltaY * 2;
    targetX = Math.max(50, Math.min(targetX, containerRect.width - 50));
    targetY = Math.max(50, Math.min(targetY, containerRect.height - 200));

    // 繪製曲線路徑（貝塞爾曲線模擬拋物線）
    const dist = Math.hypot(targetX - startX, targetY - startY);
    const traj = this.physics.calculateTrajectory(startX, startY, targetX, targetY, this.powerLevel, dist);

    // 計算控制點（拋物線頂點）
    const controlX = startX + (targetX - startX) * 0.5;
    const controlY = Math.min(startY, targetY) - traj.peakHeight;

    // 使用二次貝塞爾曲線
    const pathD = `M${startX},${startY} Q${controlX},${controlY} ${targetX},${targetY}`;
    $('#guide-line-path').attr('d', pathD);
  }

  handleBallEnd(e) {
    if (!this.isDragging || !this.state.gameActive) return;

    e.preventDefault();
    this.isDragging = false;

    $('#power-indicator').hide();
    $('#ball').removeClass('dragging');
    // 隱藏並清除拋物線預覽
    $('#guide-line').hide();
    
    const clientX = e.type === 'touchend' ? e.originalEvent.changedTouches[0].clientX : e.clientX;
    const clientY = e.type === 'touchend' ? e.originalEvent.changedTouches[0].clientY : e.clientY;
    
    const deltaX = clientX - this.startPos.x;
    const deltaY = clientY - this.startPos.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > GAME_CONFIG.MIN_DRAG_DISTANCE) {
      const containerRect = $(".container")[0].getBoundingClientRect();
      let targetX = this.startPos.x - containerRect.left - deltaX * 2;
      let targetY = this.startPos.y - containerRect.top - deltaY * 2;

      targetX = Math.max(50, Math.min(targetX, containerRect.width - 50));
      targetY = Math.max(50, Math.min(targetY, containerRect.height - 200));

      this.shootBall(targetX, targetY, this.powerLevel);
    } else {
      this.resetBallPosition();
    }
  }
}

// ========== 初始化遊戲 ==========
$(document).ready(() => {
  new BasketballGame();
});
