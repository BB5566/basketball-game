/**
 * 投籃機遊戲 - 主要遊戲邏輯
 * 功能：三關卡投籃遊戲，包含移動籃框、特效系統、分數計算等
 */

// ========== 遊戲狀態管理 ==========
class GameState {
  constructor() {
    this.score = 0;
    this.topScore = localStorage.getItem('topScore') || 0;
    this.timeLeft = 120;
    this.gameActive = false;
    this.gameTimer = null;
    this.currentLevel = 1;
    this.consecutiveHits = 0;
    this.lastHitTime = 0;
    this.basketMoving = false;
  }

  reset() {
    this.score = 0;
    this.timeLeft = 120;
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
      localStorage.setItem('topScore', this.topScore);
      return true;
    }
    return false;
  }
}

// ========== 球物理引擎 ==========
class BallPhysics {
  constructor() {
    this.ballOriginalPos = { x: '50%', y: '70%' };
  }

  calculateTrajectory(startX, startY, targetX, targetY, power, distance) {
    const flightTime = Math.max(800, Math.min(1500, distance * 2 + power * 5));
    const peakHeight = Math.max(100, Math.min(300, power * 2 + distance * 0.5));
    
    return {
      flightTime,
      peakHeight,
      midX: startX + (targetX - startX) * 0.5,
      midY: Math.min(startY, targetY) - peakHeight
    };
  }

  isWithinBasketRange(targetX, targetY, basketCenterX, basketCenterY, level) {
    const distance = Math.sqrt(
      Math.pow(targetX - basketCenterX, 2) + 
      Math.pow(targetY - basketCenterY, 2)
    );

    const ranges = {
      1: 350, // 第一關最寬鬆
      2: 250, // 第二關中等
      3: 200  // 第三關有挑戰性
    };

    return distance <= (ranges[level] || 240);
  }

  checkBasketHit(ballX, ballY) {
    const basketIn = $('#basket-in');
    const basketInRect = basketIn[0].getBoundingClientRect();
    const containerRect = $('.container')[0].getBoundingClientRect();
    
    const basketLeft = basketInRect.left - containerRect.left;
    const basketRight = basketLeft + basketInRect.width;
    const basketTop = basketInRect.top - containerRect.top;
    const basketHeight = basketInRect.height;
    
    // 水平判定
    if (ballX < basketLeft || ballX > basketRight) {
      return false;
    }
    
    // 垂直判定：上下各20%容差
    const tolerance = basketHeight * 0.2;
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
      left: (x - 20) + 'px',
      top: (y - 20) + 'px'
    });
    $('.container').append(popup);
    
    setTimeout(() => popup.remove(), 1200);
  }

  static showComboEffect(combo, x, y) {
    if (combo < 2) return;
    
    const comboText = $(`<div class="combo-text">COMBO x${combo}!</div>`);
    comboText.css({
      left: (x - 50) + 'px',
      top: (y - 80) + 'px'
    });
    $('.container').append(comboText);
    
    setTimeout(() => comboText.remove(), 1000);
  }

  static showSuccessEffect(x, y) {
    // 光圈效果
    const ripple = $('<div class="success-ripple"></div>');
    ripple.css({
      position: 'absolute',
      left: (x - 30) + 'px',
      top: (y - 30) + 'px',
      width: '60px',
      height: '60px',
      border: '4px solid #4CAF50',
      borderRadius: '50%',
      animation: 'rippleEffect 0.8s ease-out forwards',
      pointerEvents: 'none',
      zIndex: 200
    });
    $('.container').append(ripple);
    
    // 螢幕閃爍
    const flash = $('<div class="screen-flash"></div>');
    $('body').append(flash);
    
    setTimeout(() => {
      ripple.remove();
      flash.remove();
    }, 800);
  }

  static createBallTrail(x, y) {
    const trail = $('<div class="ball-trail"></div>');
    trail.css({
      left: (x - 30) + 'px',
      top: (y - 30) + 'px'
    });
    $('.container').append(trail);
    
    setTimeout(() => trail.remove(), 500);
  }

  static showLevelUpMessage(level) {
    const messages = {
      2: '🎯 LEVEL 2 - 籃框開始移動！',
      3: '🔥 LEVEL 3 - 挑戰極限！'
    };
    
    const message = messages[level] || 'LEVEL UP!';
    const levelUpText = $(`<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 28px; font-weight: bold; color: #FFD700; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); z-index: 200; animation: levelUpFloat 2.5s ease-out forwards; text-align: center;">${message}</div>`);
    $('.container').append(levelUpText);
    
    // 升級閃光效果
    const flash = $('<div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 215, 0, 0.3); pointer-events: none; z-index: 199; animation: screenFlash 0.5s ease-out forwards;"></div>');
    $('body').append(flash);
    
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
    
    const basket = $('.baseket');
    const basketIn = $('#basket-in');
    const basketArea = $('#basket-area');
    
    const config = {
      2: { speed: 0.6, range: 15 },
      3: { speed: 0.9, range: 25 }
    };
    
    const { speed, range } = config[level] || config[2];
    
    this.moveInterval = setInterval(() => {
      this.currentOffset += this.direction * speed;
      
      if (this.currentOffset >= range) {
        this.direction = -1;
      } else if (this.currentOffset <= -range) {
        this.direction = 1;
      }
      
      const newTransform = `translate(calc(-50% + ${this.currentOffset}%), -50%)`;
      basket.css('transform', newTransform);
      basketIn.css('transform', newTransform);
      basketArea.css('transform', newTransform);
    }, 25);
  }

  stopMovement() {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
    }
    
    const resetTransform = 'translate(-50%, -50%)';
    $('.baseket').css('transform', resetTransform);
    $('#basket-in').css('transform', resetTransform);
    $('#basket-area').css('transform', resetTransform);
    
    this.currentOffset = 0;
    this.direction = 1;
  }

  updateSize(level) {
    const basket = $('.baseket');
    const basketIn = $('#basket-in');
    
    if (level === 1) {
      basket.addClass('level-1');
      basketIn.addClass('level-1');
    } else {
      basket.removeClass('level-1');
      basketIn.removeClass('level-1');
    }
  }

  shake(isMoving = false) {
    const basket = $('.baseket');
    const basketIn = $('#basket-in');
    
    if (isMoving) {
      const currentTransform = basket.css('transform');
      basket.css({
        '--current-transform': currentTransform,
        animation: 'basketShakeMoving 0.5s ease-in-out'
      });
      basketIn.css({
        '--current-transform': currentTransform,
        animation: 'basketShakeMoving 0.5s ease-in-out'
      });
    } else {
      basket.css('animation', 'basketShake 0.5s ease-in-out');
      basketIn.css('animation', 'basketShake 0.5s ease-in-out');
    }
    
    setTimeout(() => {
      basket.css('animation', '');
      basketIn.removeClass('show').css('animation', '');
      basketIn.css('transform', basket.css('transform'));
    }, 1000);
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
    this.powerTimer = null;
    
    this.init();
  }

  init() {
    this.updateUI();
    this.setupEventListeners();
    this.startGameTimer();
  }

  updateUI() {
    $('#score').text(this.state.score);
    $('#timer').text(this.state.timeLeft);
    $('#level').text(this.state.currentLevel);
    $('#top-score').text(this.state.topScore);
    this.basketController.updateSize(this.state.currentLevel);
  }

  setupEventListeners() {
    // 球的拖拽事件
    $('#ball').on('mousedown touchstart', (e) => this.handleBallStart(e));
    $(document).on('mousemove touchmove', (e) => this.handleBallMove(e));
    $(document).on('mouseup touchend', (e) => this.handleBallEnd(e));
    $(document).on('dragstart', (e) => e.preventDefault());
    
    // 重新開始按鈕
    window.restartGame = () => this.restart();
  }

  startGameTimer() {
    this.state.gameActive = true;
    this.state.gameTimer = setInterval(() => {
      this.state.timeLeft--;
      $('#timer').text(this.state.timeLeft);
      
      if (this.state.timeLeft <= 0) {
        this.endGame();
      }
    }, 1000);
  }

  endGame() {
    this.state.gameActive = false;
    clearInterval(this.state.gameTimer);
    this.basketController.stopMovement();
    
    const isNewRecord = this.state.updateTopScore();
    
    $('#final-score').text(this.state.score);
    $('#final-top-score').text(this.state.topScore);
    $('#game-over-modal').show();
  }

  restart() {
    this.state.reset();
    this.basketController.stopMovement();
    this.resetBallPosition();
    $('#game-over-modal').hide();
    this.updateUI();
    this.startGameTimer();
  }

  checkLevelUp() {
    const thresholds = { 1: 15, 2: 35 };
    const threshold = thresholds[this.state.currentLevel];
    
    if (threshold && this.state.score >= threshold) {
      this.state.currentLevel++;
      this.basketController.updateSize(this.state.currentLevel);
      $('#level').text(this.state.currentLevel);
      EffectSystem.showLevelUpMessage(this.state.currentLevel);
      
      if (this.state.currentLevel >= 2) {
        this.state.basketMoving = true;
        this.basketController.startMovement(this.state.currentLevel);
      }
    }
  }

  calculateScore(power) {
    const basePoints = Math.floor(power / 8) + 2;
    const comboBonus = Math.max(0, (this.state.consecutiveHits - 1) * 3);
    const levelBonus = (this.state.currentLevel - 1) * 2;
    return basePoints + comboBonus + levelBonus;
  }

  handleBasketHit(ballX, ballY, power) {
    const ball = $('#ball');
    const basket = $('.baseket');
    const basketIn = $('#basket-in');
    
    // 同步籃框位置
    basketIn.css('transform', basket.css('transform'));
    basketIn.addClass('show');
    
    // 獲取籃框中心位置
    const basketRect = basket[0].getBoundingClientRect();
    const containerRect = $('.container')[0].getBoundingClientRect();
    const basketCenterX = basketRect.left - containerRect.left + basketRect.width / 2;
    const basketCenterY = basketRect.top - containerRect.top + basketRect.height / 2;
    
    // 球進籃動畫序列
    this.animateBallIntoBasket(ball, basketCenterX, basketCenterY);
    
    // 更新連擊
    const currentTime = Date.now();
    if (currentTime - this.state.lastHitTime < 3000) {
      this.state.consecutiveHits++;
    } else {
      this.state.consecutiveHits = 1;
    }
    this.state.lastHitTime = currentTime;
    
    // 計算分數
    const points = this.calculateScore(power);
    this.state.score += points;
    $('#score').text(this.state.score);
    
    // 顯示特效
    EffectSystem.showScorePopup(points, basketCenterX, basketCenterY);
    if (this.state.consecutiveHits > 1) {
      EffectSystem.showComboEffect(this.state.consecutiveHits, basketCenterX, basketCenterY - 100);
    }
    EffectSystem.showSuccessEffect(basketCenterX, basketCenterY);
    
    // 籃框震動
    this.basketController.shake(this.state.basketMoving);
    
    // 檢查升級
    this.checkLevelUp();
    
    // 重置球位置
    setTimeout(() => this.resetBallPosition(), 1800);
  }

  animateBallIntoBasket(ball, centerX, centerY) {
    const animations = [
      { delay: 0, top: centerY - 20, scale: 0.9, rotation: 360 },
      { delay: 300, scale: 0.8, rotation: 540 },
      { delay: 500, top: centerY + 80, scale: 0.7, rotation: 720 },
      { delay: 900, top: centerY + 120, scale: 0.6, rotation: 900, opacity: 0.8 },
      { delay: 1200, scale: 0.7, rotation: 1080 },
      { delay: 1400, scale: 0.6, rotation: 1080, opacity: 0.9 }
    ];

    animations.forEach(({ delay, top, scale, rotation, opacity }) => {
      setTimeout(() => {
        const style = {
          left: (centerX - 40) + 'px',
          transform: `translate(0, 0) scale(${scale}) rotate(${rotation}deg)`,
          transition: delay === 0 ? 'all 0.3s ease-in' : 'all 0.2s ease'
        };
        
        if (top !== undefined) style.top = top + 'px';
        if (opacity !== undefined) style.opacity = opacity;
        
        ball.css(style);
      }, delay);
    });
  }

  shootBall(targetX, targetY, power) {
    if (!this.state.gameActive) return;
    
    const ball = $('#ball');
    const ballRect = ball[0].getBoundingClientRect();
    const containerRect = $('.container')[0].getBoundingClientRect();
    
    const startX = ballRect.left - containerRect.left + ballRect.width / 2;
    const startY = ballRect.top - containerRect.top + ballRect.height / 2;
    
    ball.addClass('shooting');
    
    // 檢查投籃範圍
    const basketRect = $('.baseket')[0].getBoundingClientRect();
    const basketCenterX = basketRect.left - containerRect.left + basketRect.width / 2;
    const basketCenterY = basketRect.top - containerRect.top + basketRect.height / 2;
    
    if (!this.physics.isWithinBasketRange(targetX, targetY, basketCenterX, basketCenterY, this.state.currentLevel)) {
      this.handleDirectDrop(targetX, targetY);
      return;
    }
    
    // 執行拋物線投籃
    this.executeParabolicShot(startX, startY, targetX, targetY, power);
  }

  executeParabolicShot(startX, startY, targetX, targetY, power) {
    const ball = $('#ball');
    const containerRect = $('.container')[0].getBoundingClientRect();
    const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));
    const trajectory = this.physics.calculateTrajectory(startX, startY, targetX, targetY, power, distance);
    
    ball.css({
      transition: `all ${trajectory.flightTime}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
      left: (targetX - 40) + 'px',
      top: (targetY - 40) + 'px',
      transform: `translate(0, 0) rotate(${power * 3}deg) scale(0.8)`
    });
    
    // 邊界檢查
    const boundaryCheck = setInterval(() => {
      if (this.isBallOutOfBounds(ball, containerRect)) {
        clearInterval(boundaryCheck);
        this.handleBallOutOfBounds();
        return;
      }
    }, 30);
    
    // 軌跡特效
    setTimeout(() => {
      if (ball.css('opacity') !== '0') {
        ball.css('transform', `translate(0, 0) rotate(${power * 6}deg) scale(1)`);
        
        const ballRect = ball[0].getBoundingClientRect();
        const trailX = ballRect.left - containerRect.left + ballRect.width / 2;
        const trailY = ballRect.top - containerRect.top + ballRect.height / 2;
        EffectSystem.createBallTrail(trailX, trailY);
      }
    }, trajectory.flightTime * 0.3);
    
    // 檢查命中結果
    setTimeout(() => {
      clearInterval(boundaryCheck);
      this.checkShotResult(ball, containerRect);
    }, trajectory.flightTime * 0.8);
  }

  checkShotResult(ball, containerRect) {
    if (ball.css('opacity') === '0') return;
    
    const ballRect = ball[0].getBoundingClientRect();
    const ballCenterX = ballRect.left - containerRect.left + ballRect.width / 2;
    const ballCenterY = ballRect.top - containerRect.top + ballRect.height / 2;
    
    if (this.isBallOutOfBounds(ball, containerRect)) {
      this.handleBallOutOfBounds();
      return;
    }
    
    if (this.physics.checkBasketHit(ballCenterX, ballCenterY)) {
      this.handleBasketHit(ballCenterX, ballCenterY, this.powerLevel);
    } else {
      this.handleMissedShot();
    }
  }

  handleMissedShot() {
    this.state.consecutiveHits = 0;
    
    const ball = $('#ball');
    const containerRect = $('.container')[0].getBoundingClientRect();
    const deskRect = $('.desk')[0].getBoundingClientRect();
    const deskTopY = deskRect.top - containerRect.top;
    
    ball.css({
      transition: 'all 0.6s ease-in',
      top: (deskTopY - 40) + 'px',
      transform: `translate(0, 0) rotate(${this.powerLevel * 4}deg) scale(0.8)`,
      opacity: '0.8'
    });
    
    setTimeout(() => this.resetBallPosition(), 1000);
  }

  handleDirectDrop(targetX, targetY) {
    const ball = $('#ball');
    const containerRect = $('.container')[0].getBoundingClientRect();
    
    if (targetX < 0 || targetX > containerRect.width || targetY < 0 || targetY > containerRect.height) {
      this.handleBallOutOfBounds();
      return;
    }
    
    const deskRect = $('.desk')[0].getBoundingClientRect();
    const deskTopY = deskRect.top - containerRect.top;
    
    ball.css({
      transition: 'all 0.8s ease-in',
      left: (targetX - 40) + 'px',
      top: (deskTopY - 40) + 'px',
      transform: 'translate(0, 0) rotate(360deg) scale(0.8)',
      opacity: '0.7'
    });
    
    setTimeout(() => this.resetBallPosition(), 1200);
  }

  isBallOutOfBounds(ball, containerRect) {
    const ballRect = ball[0].getBoundingClientRect();
    const ballX = ballRect.left - containerRect.left + ballRect.width / 2;
    const ballY = ballRect.top - containerRect.top + ballRect.height / 2;
    
    return ballX < -20 || ballX > containerRect.width + 20 || 
           ballY < -20 || ballY > containerRect.height + 20;
  }

  handleBallOutOfBounds() {
    const ball = $('#ball');
    ball.css({
      opacity: '0',
      transition: 'none',
      animation: 'none',
      transform: 'translate(-50%, -50%) scale(0)'
    }).removeClass('shooting');
    
    setTimeout(() => this.resetBallPosition(), 200);
  }

  resetBallPosition() {
    $('#ball').css({
      top: this.physics.ballOriginalPos.y,
      left: this.physics.ballOriginalPos.x,
      transform: 'translate(-50%, -50%)',
      transition: 'all 0.3s ease',
      opacity: '1'
    }).removeClass('shooting');
  }

  // ========== 事件處理 ==========
  handleBallStart(e) {
    if (!this.state.gameActive) return;
    
    e.preventDefault();
    this.isDragging = true;
    
    const clientX = e.type === 'touchstart' ? e.originalEvent.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.originalEvent.touches[0].clientY : e.clientY;
    
    this.startPos = { x: clientX, y: clientY };
    $('#ball').addClass('dragging');
    
    this.startPowerAccumulation();
  }

  handleBallMove(e) {
    if (!this.isDragging || !this.state.gameActive) return;
    
    e.preventDefault();
    const clientX = e.type === 'touchmove' ? e.originalEvent.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.originalEvent.touches[0].clientY : e.clientY;
    
    const distance = Math.sqrt(
      Math.pow(clientX - this.startPos.x, 2) + 
      Math.pow(clientY - this.startPos.y, 2)
    );
    this.powerLevel = Math.min(100, distance / 2);
    $('#power-bar').css('width', this.powerLevel + '%');
  }

  handleBallEnd(e) {
    if (!this.isDragging || !this.state.gameActive) return;
    
    e.preventDefault();
    this.isDragging = false;
    this.stopPowerAccumulation();
    
    const clientX = e.type === 'touchend' ? e.originalEvent.changedTouches[0].clientX : e.clientX;
    const clientY = e.type === 'touchend' ? e.originalEvent.changedTouches[0].clientY : e.clientY;
    
    const deltaX = clientX - this.startPos.x;
    const deltaY = clientY - this.startPos.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance > 20) {
      const containerRect = $('.container')[0].getBoundingClientRect();
      let targetX = this.startPos.x - containerRect.left + deltaX * 2;
      let targetY = this.startPos.y - containerRect.top + deltaY * 2;
      
      targetX = Math.max(50, Math.min(targetX, containerRect.width - 50));
      targetY = Math.max(50, Math.min(targetY, containerRect.height - 50));
      
      this.shootBall(targetX, targetY, this.powerLevel);
    } else {
      this.resetBallPosition();
    }
  }

  startPowerAccumulation() {
    this.powerLevel = 0;
    $('#power-indicator').show().css('transform', 'translateX(-50%) scale(1.1)');
    
    this.powerTimer = setInterval(() => {
      this.powerLevel = Math.min(100, this.powerLevel + 1.0);
      $('#power-bar').css('width', this.powerLevel + '%');
      
      if (this.powerLevel >= 100) {
        $('#power-indicator').css('box-shadow', '0 4px 20px rgba(255,193,7,0.6)');
      }
    }, 60);
  }

  stopPowerAccumulation() {
    clearInterval(this.powerTimer);
    $('#power-indicator').hide().css({
      transform: 'translateX(-50%) scale(1)',
      boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
    });
    $('#ball').removeClass('dragging');
  }
}

// ========== 初始化遊戲 ==========
$(document).ready(() => {
  new BasketballGame();
});
