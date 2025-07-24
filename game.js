/**
 * 投籃機遊戲 - 主要遊戲邏輯 (重構版)
 * 功能：三關卡投籃遊戲，包含移動籃框、特效系統、分數計算等
 * 優化：簡化遊戲難度、提升代碼可讀性、優化使用者體驗
 */

// ========== 遊戲狀態管理 ==========
class GameState {
  constructor() {
    this.score = 0;
    this.topScore = localStorage.getItem("topScore") || 0;
    this.timeLeft = 150; // 增加遊戲時間
    this.gameActive = false;
    this.gameTimer = null;
    this.currentLevel = 1;
    this.consecutiveHits = 0;
    this.lastHitTime = 0;
    this.basketMoving = false;
  }

  reset() {
    this.score = 0;
    this.timeLeft = 150; // 重置時也使用新的時間
    this.currentLevel = 1;
    this.basketMoving = false;
    this.consecutiveHits = 0;
    this.gameActive = false;
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
    // 簡化計算，讓軌跡更可預測
    const flightTime = Math.max(700, Math.min(1400, distance * 2.5));
    const peakHeight = Math.max(
      120,
      Math.min(350, power * 2.5 + distance * 0.4)
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

    // 擴大所有關卡的投籃判定區域，讓遊戲更友好
    const ranges = {
      1: 380, // 第一關非常寬鬆
      2: 280, // 第二關依然寬鬆
      3: 230, // 第三關更具挑戰性，但仍比之前容易
    };

    return distance <= (ranges[level] || 260);
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
      3: "🔥 LEVEL 3 - 挑戰極限！",
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
    this.moveInterval = null;
    this.direction = 1;
    this.currentOffset = 0;
  }

  startMovement(level) {
    if (this.moveInterval) return;

    const basket = $(".baseket");
    const basketIn = $("#basket-in");
    const basketArea = $("#basket-area");

    const config = {
      2: { speed: 0.6, range: 15 },
      3: { speed: 0.9, range: 25 },
    };

    const { speed, range } = config[level] || config[2];

    this.moveInterval = setInterval(() => {
      this.currentOffset += this.direction * speed;

      if (Math.abs(this.currentOffset) >= range) {
        this.direction *= -1;
      }

      const newTransform = `translate(calc(-50% + ${this.currentOffset}%), -50%)`;
      basket.css("transform", newTransform);
      basketIn.css("transform", newTransform);
      basketArea.css("transform", newTransform);
    }, 25);
  }

  stopMovement() {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
    }

    const resetTransform = "translate(-50%, -50%)";
    $(".baseket, #basket-in, #basket-area").css("transform", resetTransform);

    this.currentOffset = 0;
    this.direction = 1;
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

// ========== 主遊戲類 ==========
class BasketballGame {
  constructor() {
    this.state = new GameState();
    this.physics = new BallPhysics();
    this.basketController = new BasketController();
    this.isDragging = false;
    this.startPos = { x: 0, y: 0 };
    this.powerLevel = 0;

    // 初始化背景音樂
    this.bgMusic = new Audio('sound.mp3');
    this.bgMusic.preload = 'auto';
    this.bgMusic.loop = true;
    this.bgMusic.volume = 0.5;

    this.init();
  }

  init() {
    this.updateUI();
    this.setupEventListeners();
    this.startGameTimer();
    // 開始播放背景音樂
    this.bgMusic.play();
    // 隱藏拋物線預覽
    $('#guide-line').hide();
  }

  updateUI() {
    $("#score").text(this.state.score);
    $("#timer").text(this.state.timeLeft);
    $("#level").text(this.state.currentLevel);
    $("#top-score").text(this.state.topScore);
    this.basketController.updateSize(this.state.currentLevel);
  }

  setupEventListeners() {
    $("#ball").on("mousedown touchstart", (e) => this.handleBallStart(e));
    $(document).on("mousemove touchmove", (e) => this.handleBallMove(e));
    $(document).on("mouseup touchend", (e) => this.handleBallEnd(e));
    $(document).on("dragstart", (e) => e.preventDefault());
    window.restartGame = () => this.restart();
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
    const thresholds = { 1: 15, 2: 35 };
    const threshold = thresholds[this.state.currentLevel];

    if (threshold && this.state.score >= threshold) {
      this.state.currentLevel++;
      this.basketController.updateSize(this.state.currentLevel);
      $("#level").text(this.state.currentLevel);
      EffectSystem.showLevelUpMessage(this.state.currentLevel);
      // 第一關後隱藏遊戲說明
      if (this.state.currentLevel > 1) {
        $('.title').hide();
      }

      if (this.state.currentLevel >= 2) {
        this.state.basketMoving = true;
        this.basketController.startMovement(this.state.currentLevel);
      }
    }
  }

  /**
   * 計算得分 (簡化版)
   * @returns {number}
   */
  calculateScore() {
    const basePoints = 10; // 固定基礎分
    const comboBonus = Math.max(0, (this.state.consecutiveHits - 1) * 3);
    const levelBonus = (this.state.currentLevel - 1) * 2;
    return basePoints + comboBonus + levelBonus;
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
      currentTime - this.state.lastHitTime < 3000
        ? this.state.consecutiveHits + 1
        : 1;
    this.state.lastHitTime = currentTime;

    const points = this.calculateScore();
    this.state.score += points;
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

    ball.css({
      transition: `all ${trajectory.flightTime}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
      left: targetX - 40 + "px",
      top: targetY - 40 + "px",
      transform: `translate(0, 0) rotate(${power * 3}deg) scale(0.8)`,
    });

    const boundaryCheck = setInterval(() => {
      if (this.isBallOutOfBounds(ball, containerRect)) {
        clearInterval(boundaryCheck);
        this.handleBallOutOfBounds();
      }
    }, 30);

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
      clearInterval(boundaryCheck);
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
    
    // 直接顯示力度條和箭頭
    this.powerLevel = 0;
    $('#power-bar').css('width', '0%');
    $('#power-indicator').show();
    $('#arrow-indicator').css({
      left: ($('#ball').position().left - 50 + 40) + 'px', // 校準箭頭中心
      top: ($('#ball').position().top - 50 + 40) + 'px',
      opacity: 0.7,
      transform: 'rotate(0deg) scale(1)'
    });
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

    // 更新箭頭方向和大小
    const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI + 90;
    $('#arrow-indicator').css({
      transform: `rotate(${angle}deg) scale(${1 + this.powerLevel / 200})`,
      opacity: 0.7 + (this.powerLevel / 100) * 0.3
    });
    // 計算並更新拋物線路徑預覽
    const ballRect = $('#ball')[0].getBoundingClientRect();
    const containerRect = $('.container')[0].getBoundingClientRect();
    const startX = ballRect.left - containerRect.left + ballRect.width / 2;
    const startY = ballRect.top - containerRect.top + ballRect.height / 2;
    let targetX = this.startPos.x - containerRect.left - deltaX * 2;
    let targetY = this.startPos.y - containerRect.top - deltaY * 2;
    targetX = Math.max(50, Math.min(targetX, containerRect.width - 50));
    targetY = Math.max(50, Math.min(targetY, containerRect.height - 200));
    const dist = Math.hypot(targetX - startX, targetY - startY);
    const traj = this.physics.calculateTrajectory(startX, startY, targetX, targetY, this.powerLevel, dist);
    const pathD = `M${startX},${startY} L${targetX},${targetY}`;
    $('#guide-line-path').attr('d', pathD);
  }

  handleBallEnd(e) {
    if (!this.isDragging || !this.state.gameActive) return;
    
    e.preventDefault();
    this.isDragging = false;
    
    $('#power-indicator').hide();
    $('#arrow-indicator').css('opacity', 0); // 隱藏箭頭
    $('#ball').removeClass('dragging');
    // 隱藏並清除拋物線預覽
    $('#guide-line').hide();
    
    const clientX = e.type === 'touchend' ? e.originalEvent.changedTouches[0].clientX : e.clientX;
    const clientY = e.type === 'touchend' ? e.originalEvent.changedTouches[0].clientY : e.clientY;
    
    const deltaX = clientX - this.startPos.x;
    const deltaY = clientY - this.startPos.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > 20) {
      // 最小拖拽距離
      const containerRect = $(".container")[0].getBoundingClientRect();
      // 投擲方向與拖拽方向相反
      let targetX = this.startPos.x - containerRect.left - deltaX * 2;
      let targetY = this.startPos.y - containerRect.top - deltaY * 2;

      // 限制投擲範圍在容器內
      targetX = Math.max(50, Math.min(targetX, containerRect.width - 50));
      targetY = Math.max(50, Math.min(targetY, containerRect.height - 200)); // 避免投太高

      this.shootBall(targetX, targetY, this.powerLevel);
    } else {
      this.resetBallPosition(); // 如果拖拽距離太短，則不投球
    }
  }
}

// ========== 初始化遊戲 ==========
$(document).ready(() => {
  new BasketballGame();
});
