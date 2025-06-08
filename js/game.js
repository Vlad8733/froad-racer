const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const cars = [
    { name: "Porsche 911", maxSpeed: 9, acceleration: 0.9, texture: 'assets/cars/yellow_car.png', cost: 50, coinMultiplier: 1.5 },
    { name: "Porsche Cayenne", maxSpeed: 7, acceleration: 0.7, texture: 'assets/cars/green_car.png', cost: 30, coinMultiplier: 1.2 },
    { name: "Porsche Panamera", maxSpeed: 8, acceleration: 0.8, texture: 'assets/cars/pink_car.png', cost: 40, coinMultiplier: 1.3 },
    { name: "Porsche Taycan", maxSpeed: 7.5, acceleration: 0.85, texture: 'assets/cars/red_car.png', cost: 60, coinMultiplier: 1.7 },
    { name: "Toyota Corolla (Sport)", maxSpeed: 5.5, acceleration: 0.5, texture: 'assets/cars/toyota_corolla_sedan.png', cost: 45, coinMultiplier: 1.4 },
    { name: "Default Car", maxSpeed: 5, acceleration: 0.3, texture: 'assets/cars/default_car.png', cost: 0, coinMultiplier: 1 }
];
const carWidth = 60, carHeight = 120, roadWidth = 300, roadLeft = canvas.width / 2 - roadWidth / 2, laneWidth = roadWidth / 2;
const laneLeftCenter = roadLeft + laneWidth / 2 - carWidth / 2, laneRightCenter = roadLeft + laneWidth + laneWidth / 2 - carWidth / 2;
const MIN_SPAWN_DISTANCE = carHeight * 2;
const DISTANCE_PER_COIN = 2000;
const DISTANCE_PER_KM = 1000;

let player = {
    x: canvas.width / 2 - carWidth / 2,
    y: canvas.height / 2,
    speed: 0,
    angle: 0,
    targetAngle: 0,
    carData: cars[4],
    isImmune: false,
    immunityTime: 0,
    velocityX: 0,
    targetSpeed: 0,
    steeringAngle: 0
};
let obstacles = [], score = 0, highScore = 0, coins = 0, gameRunning = false, gamePaused = false;
let obstaclesPassed = 0, cameraY = 0, lastCoinDistance = 0;
const reviveCost = 5, MAX_COINS = 999999;
let ownedCars = [cars[4].name];
let userId = null;
let justRevived = false;

canvas.style.display = 'none';
document.querySelectorAll('.ui').forEach(el => el.style.display = 'none');
document.querySelector('.speedometer') && (document.querySelector('.speedometer').style.display = 'none');
document.querySelector('.controls') && (document.querySelector('.controls').style.display = 'none');

const loadGameState = async () => {
    userId = localStorage.getItem('userId') || new URLSearchParams(window.location.search).get('user_id');
    if (userId) {
        localStorage.setItem('userId', userId);
        try {
            const response = await fetch(`api.php?action=load&user_id=${encodeURIComponent(userId)}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.error) {
                console.error('Load error:', data.error);
                coins = 0;
                highScore = 0;
                ownedCars = [cars[4].name];
                player.carData = cars[4];
            } else {
                coins = data.coins;
                highScore = data.high_score;
                ownedCars = data.owned_cars || [cars[4].name];
                player.carData = cars.find(car => car.name === data.current_car) || cars[4];
            }
            if (coins > MAX_COINS) coins = MAX_COINS;
            if (coins < 0) coins = 0;
            if (highScore < 0) highScore = 0;
            carImage.src = player.carData.texture;
        } catch (error) {
            console.error('Failed to load game state:', error);
            coins = 0;
            highScore = 0;
            ownedCars = [cars[4].name];
            player.carData = cars[4];
            carImage.src = player.carData.texture;
        }
    } else {
        console.log('No user ID, using default state');
        coins = 0;
        highScore = 0;
        ownedCars = [cars[4].name];
        player.carData = cars[4];
        carImage.src = player.carData.texture;
    }
    document.getElementById('startCoinsDisplay').textContent = `Coins: ${coins}`;
    document.getElementById('startHighScoreDisplay').textContent = `High Score: ${highScore}`;
};

const saveGameState = async () => {
    if (!userId) return;
    try {
        const response = await fetch('api.php?action=save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                coins: coins,
                high_score: highScore,
                current_car: player.carData.name,
                owned_cars: ownedCars
            })
        });
        const data = await response.json();
        if (data.error) console.error('Save error:', data.error);
    } catch (error) {
        console.error('Failed to save game state:', error);
    }
};

const carImage = new Image();
carImage.src = player.carData.texture;
carImage.onerror = () => {
    console.warn(`Failed to load car image from ${carImage.src}, using fallback`);
    carImage.src = 'https://via.placeholder.com/60x120/FF0000/FFFFFF?text=Sports+Car';
};

const drawRoad = () => {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const roadRight = canvas.width / 2 + roadWidth / 2;

    ctx.fillStyle = '#333';
    ctx.fillRect(roadLeft, 0, roadWidth, canvas.height);

    ctx.fillStyle = '#00ffcc';
    ctx.fillRect(roadLeft - 15, 0, 15, canvas.height);
    ctx.fillRect(roadRight, 0, 15, canvas.height);

    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 6;
    const centerX = canvas.width / 2;
    const dashLength = 60;
    const gapLength = 30;
    for (let y = -cameraY % (dashLength + gapLength); y < canvas.height; y += dashLength + gapLength) {
        ctx.beginPath();
        ctx.moveTo(centerX, y);
        ctx.lineTo(centerX, y + dashLength);
        ctx.stroke();
    }
};

const drawPlayer = () => {
    ctx.save();
    ctx.translate(player.x + carWidth / 2, player.y);
    ctx.rotate(player.angle);
    if (carImage.complete && carImage.naturalHeight) {
        const aspectRatio = carImage.naturalWidth / carImage.naturalHeight;
        const drawHeight = carHeight;
        const drawWidth = drawHeight * aspectRatio;
        ctx.drawImage(carImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    } else {
        ctx.fillStyle = player.isImmune ? 'rgba(255, 68, 68, 0.5)' : '#ff4444';
        ctx.fillRect(-carWidth / 2, -carHeight / 2, carWidth, carHeight);
    }
    ctx.restore();
};

const drawObstacle = obstacle => {
    const y = obstacle.y - cameraY;
    if (y > -carHeight && y < canvas.height) {
        ctx.save();
        ctx.translate(obstacle.x + carWidth / 2, y + carHeight / 2);
        if (obstacle.speed > 0) {
            ctx.rotate(Math.PI); // Rotate 180 degrees if moving upward, since images face downward by default
        }
        const obstacleImage = obstacle.image;
        if (obstacleImage.complete && obstacleImage.naturalHeight) {
            const aspectRatio = obstacleImage.naturalWidth / obstacleImage.naturalHeight;
            const drawHeight = carHeight;
            const drawWidth = drawHeight * aspectRatio;
            ctx.drawImage(obstacleImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        } else {
            ctx.fillStyle = '#888';
            ctx.fillRect(-carWidth / 2, -carHeight / 2, carWidth, carHeight);
        }
        ctx.restore();
    }
};

const createObstacle = (lane, positionType) => {
    let speed, startY;
    if (lane === 0) {
        speed = 2;
        startY = cameraY - carHeight;
    } else if (lane === 1 && positionType === 'sameDirection') {
        speed = 1.5;
        startY = cameraY + canvas.height;
    } else {
        speed = -2;
        startY = cameraY - carHeight;
    }

    const isTooClose = obstacles.some(ob => 
        ob.lane === lane && Math.abs(ob.y - startY) < MIN_SPAWN_DISTANCE
    );
    if (!isTooClose) {
        const randomCar = cars[Math.floor(Math.random() * cars.length)];
        const obstacleImage = new Image();
        obstacleImage.src = randomCar.texture;
        obstacleImage.onerror = () => {
            console.warn(`Failed to load obstacle image from ${obstacleImage.src}, using fallback`);
            obstacleImage.src = 'https://via.placeholder.com/60x120/888888/FFFFFF?text=Enemy';
        };
        obstacles.push({ x: lane ? laneRightCenter : laneLeftCenter, y: startY, speed, lane, image: obstacleImage });
    }
};

const updateObstacles = () => {
    for (let i = 0; i < obstacles.length; i++) {
        obstacles[i].y += obstacles[i].speed;
        const y = obstacles[i].y - cameraY;
        if (!player.isImmune && checkCollision(player, { x: obstacles[i].x, y })) {
            gameRunning = false;
            showGameOver();
            return;
        }
        if (obstacles[i].speed > 0 && y > canvas.height + carHeight) {
            obstacles.splice(i--, 1);
            score += 10;
            obstaclesPassed++;
        } else if (obstacles[i].speed < 0 && y < -carHeight * 2) {
            obstacles[i].y = cameraY + canvas.height + carHeight;
        }
    }
};

const checkCollision = (obj1, obj2) => {
    const widthReduction = 0.6;
    const heightReduction = 0.8;

    const obj1Width = carWidth * widthReduction, obj1Height = carHeight * heightReduction;
    const obj2Width = (obj2.width || carWidth) * widthReduction, obj2Height = (obj2.height || carHeight) * heightReduction;

    const obj1X = obj1.x + (carWidth - obj1Width) / 2;
    const obj1Y = obj1.y - obj1Height / 2;
    const obj2X = obj2.x + (carWidth - obj2Width) / 2;
    const obj2Y = obj2.y - obj2Height / 2;

    return obj1X < obj2X + obj2Width && obj1X + obj1Width > obj2X &&
           obj1Y < obj2Y + obj2Height && obj1Y + obj1Height > obj2Y;
};

const showCoinAnimation = (coinsEarned) => {
    const coinAnimation = document.getElementById('coinAnimation');
    coinAnimation.textContent = `+${coinsEarned}`;
    coinAnimation.classList.add('active');
    setTimeout(() => {
        coinAnimation.classList.remove('active');
        coinAnimation.textContent = '';
    }, 1000);
};

const updatePlayer = () => {
    if (gamePaused) return;

    const drag = 0.015;
    const massFactor = 0.2;
    const maxSteeringAngle = Math.PI / 6;
    const steeringSpeed = 0.1;
    const turnInfluence = 0.05;

    if (keys.up || keys.w) {
        player.targetSpeed += player.carData.acceleration * 0.05;
    } else if (keys.down || keys.s) {
        player.targetSpeed -= player.carData.acceleration * 0.015;
    } else {
        player.targetSpeed -= drag * 2;
    }

    player.targetSpeed = Math.max(0, Math.min(player.targetSpeed, player.carData.maxSpeed));
    const acceleration = (player.targetSpeed - player.speed) / (massFactor + 0.1);
    player.speed += acceleration * 0.25;
    player.speed = Math.max(0, Math.min(player.speed, player.carData.maxSpeed));

    if (keys.left) {
        player.steeringAngle -= steeringSpeed;
    } else if (keys.right) {
        player.steeringAngle += steeringSpeed;
    } else {
        player.steeringAngle *= 0.92;
    }
    player.steeringAngle = Math.max(-maxSteeringAngle, Math.min(player.steeringAngle, maxSteeringAngle));

    const speedFactor = 1 - (player.speed / player.carData.maxSpeed) * 0.5;
    const turnAngle = player.steeringAngle * speedFactor * turnInfluence;
    player.angle += turnAngle;

    const lateralForce = Math.sin(player.angle) * player.speed * 0.1;
    player.velocityX += lateralForce - player.velocityX * 0.2;
    player.x = Math.max(roadLeft, Math.min(player.x + player.velocityX, roadLeft + roadWidth - carWidth));

    cameraY -= player.speed;
    if (player.isImmune && (player.immunityTime -= 1 / 60) <= 0) player.isImmune = false;
    document.getElementById('speedometer').textContent = `Speed: ${Math.round((player.speed / player.carData.maxSpeed) * 120)} km/h`;
};

const gameLoop = () => {
    if (!gameRunning || gamePaused) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoad();
    drawPlayer();
    updateObstacles();
    obstacles.forEach(drawObstacle);
    updatePlayer();
    const distanceTraveled = -cameraY / DISTANCE_PER_KM;
    document.getElementById('distanceDisplay').textContent = `Distance: ${Math.floor(distanceTraveled)} km`;
    if (-cameraY - lastCoinDistance >= DISTANCE_PER_COIN && !justRevived) {
        const coinsEarned = Math.round(player.carData.coinMultiplier);
        coins = Math.min(coins + coinsEarned, MAX_COINS);
        lastCoinDistance += DISTANCE_PER_COIN;
        saveGameState();
        document.getElementById('coinsDisplay').textContent = `Coins: ${coins}`;
        showCoinAnimation(coinsEarned);
    }
    justRevived = false;
    document.getElementById('scoreDisplay').textContent = `Score: ${score}`;
    document.getElementById('highScoreDisplay').textContent = `High Score: ${highScore}`;
    requestAnimationFrame(gameLoop);
};

const keys = { left: false, right: false, up: false, down: false, w: false, s: false };
document.addEventListener('keydown', e => {
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach(k => {
        if (e.key === k) keys[k.replace('Arrow', '').toLowerCase()] = true;
    });
    if (['w', 's'].includes(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
});
document.addEventListener('keyup', e => {
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach(k => {
        if (e.key === k) keys[k.replace('Arrow', '').toLowerCase()] = false;
    });
    if (['w', 's'].includes(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
});

const showStartScreen = () => {
    console.log('showStartScreen called');
    canvas.style.display = 'none';
    document.querySelectorAll('.ui').forEach(el => {
        el.style.display = 'none';
        console.log('Hiding UI element:', el.id);
    });
    const speedometer = document.querySelector('.speedometer');
    if (speedometer) {
        speedometer.style.display = 'none';
        console.log('Hiding speedometer');
    } else {
        console.error('Speedometer element not found');
    }
    const controls = document.querySelector('.controls');
    if (controls) {
        controls.style.display = 'none';
        console.log('Hiding controls');
    } else {
        console.error('Controls element not found');
    }

    const startScreen = document.getElementById('startScreen');
    const carSelection = document.getElementById('carSelection');

    if (!startScreen || !carSelection) {
        console.error('Error: startScreen or carSelection not found in DOM');
        console.log('startScreen:', startScreen);
        console.log('carSelection:', carSelection);
        return;
    }

    carSelection.innerHTML = '';
    document.getElementById('startHighScoreDisplay').textContent = `High Score: ${highScore}`;
    document.getElementById('startCoinsDisplay').textContent = `Coins: ${coins}`;

    cars.forEach(car => {
        const div = document.createElement('div');
        div.className = 'car-option';

        const img = new Image();
        img.src = car.texture;
        img.width = img.height = 150;
        img.alt = car.name;
        img.onerror = () => {
            console.warn(`Error loading image for ${car.name} from ${car.texture}`);
            img.src = 'https://via.placeholder.com/150x150/FF0000/FFFFFF?text=Car';
        };
        div.appendChild(img);

        const nameP = document.createElement('p');
        nameP.textContent = car.name;
        div.appendChild(nameP);

        const costP = document.createElement('p');
        costP.textContent = `${car.cost > 0 ? `(${car.cost} coins)` : '(Free)'}`;
        div.appendChild(costP);

        const infoIcon = document.createElement('span');
        infoIcon.textContent = 'ⓘ';
        infoIcon.className = 'info-icon';
        infoIcon.onclick = () => {
            const modal = document.createElement('div');
            modal.className = 'info-modal';
            modal.innerHTML = `
                <div class="info-content">
                    <h2>${car.name}</h2>
                    <p>Max Speed: ${car.maxSpeed}</p>
                    <p>Acceleration: ${car.acceleration}</p>
                    <p>Cost: ${car.cost} coins</p>
                    <p>Coin Multiplier: ${car.coinMultiplier}</p>
                    <button class="close-modal">Close</button>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('.close-modal').onclick = () => {
                modal.remove();
            };
        };
        div.appendChild(infoIcon);

        if (ownedCars.includes(car.name)) {
            div.style.cursor = 'pointer';
            div.onclick = (e) => {
                if (e.target !== infoIcon) {
                    player.carData = car;
                    carImage.src = car.texture;
                    saveGameState();
                    document.querySelectorAll('.car-option').forEach(opt => opt.style.border = '2px solid transparent');
                    div.style.border = '2px solid #ff00ff';
                    console.log(`Selected car: ${car.name}`);
                }
            };
        } else {
            const buyButton = document.createElement('button');
            buyButton.textContent = `Buy (${car.cost} coins)`;
            buyButton.disabled = coins < car.cost;
            buyButton.className = 'buy-btn';
            buyButton.onclick = () => {
                if (coins >= car.cost) {
                    coins -= car.cost;
                    ownedCars.push(car.name);
                    saveGameState();
                    document.getElementById('startCoinsDisplay').textContent = `Coins: ${coins}`;
                    div.innerHTML = '';
                    div.appendChild(img);
                    const ownedP = document.createElement('p');
                    ownedP.textContent = car.name;
                    div.appendChild(ownedP);
                    const costPOwned = document.createElement('p');
                    costPOwned.textContent = '(Owned)';
                    div.appendChild(costPOwned);
                    const infoIconNew = document.createElement('span');
                    infoIconNew.textContent = 'ⓘ';
                    infoIconNew.className = 'info-icon';
                    infoIconNew.onclick = () => {
                        const modal = document.createElement('div');
                        modal.className = 'info-modal';
                        modal.innerHTML = `
                            <div class="info-content">
                                <h2>${car.name}</h2>
                                <p>Max Speed: ${car.maxSpeed}</p>
                                <p>Acceleration: ${car.acceleration}</p>
                                <p>Cost: ${car.cost} coins</p>
                                <p>Coin Multiplier: ${car.coinMultiplier}</p>
                                <button class="close-modal">Close</button>
                            </div>
                        `;
                        document.body.appendChild(modal);
                        modal.querySelector('.close-modal').onclick = () => {
                            modal.remove();
                        };
                    };
                    div.appendChild(infoIconNew);
                    div.style.cursor = 'pointer';
                    div.onclick = (e) => {
                        if (e.target !== infoIconNew) {
                            player.carData = car;
                            carImage.src = car.texture;
                            saveGameState();
                            document.querySelectorAll('.car-option').forEach(opt => opt.style.border = '2px solid transparent');
                            div.style.border = '2px solid #ff00ff';
                            console.log(`Selected car: ${car.name}`);
                        }
                    };
                    buyButton.remove();
                }
            };
            div.appendChild(buyButton);
        }
        carSelection.appendChild(div);
    });

    let logoutBtn = startScreen.querySelector('.logout-btn');
    if (!logoutBtn) {
        logoutBtn = document.createElement('button');
        logoutBtn.textContent = 'Logout';
        logoutBtn.className = 'start-btn logout-btn';
        startScreen.appendChild(logoutBtn);
    }
    logoutBtn.onclick = () => {
        userId = null;
        localStorage.removeItem('userId');
        window.location.href = 'login.html';
    };

    startScreen.style.display = 'flex';
    console.log('Start screen should now be visible');

    const startBtn = document.getElementById('startBtn');
    if (!startBtn) {
        console.error('Start button (startBtn) not found in DOM');
        return;
    }
    startBtn.onclick = () => {
        console.log('Start button clicked');
        if (!player.carData || !ownedCars.includes(player.carData.name)) {
            alert('Please select a purchased car before starting the race!');
            return;
        }
        startScreen.style.display = 'none';
        startGame();
    };
    console.log('Start button event listener set');
};

const showGameOver = () => {
    console.log('showGameOver called');
    obstacles = [];
    if (score > highScore) {
        highScore = score;
        saveGameState();
    }
    const gameOverScreen = document.getElementById('gameOverScreen');
    document.getElementById('finalScore').textContent = `Score: ${score}`;
    document.getElementById('finalHighScore').textContent = `High Score: ${highScore}`;
    document.getElementById('finalCoins').textContent = `Coins: ${coins}`;
    const reviveBtn = document.getElementById('reviveBtn');
    reviveBtn.disabled = coins < reviveCost;
    reviveBtn.textContent = `Revive for ${reviveCost} Coins`;
    reviveBtn.onclick = () => {
        if (coins >= reviveCost) {
            console.log(`Before revive: coins = ${coins}`);
            coins -= reviveCost;
            console.log(`After revive: coins = ${coins}`);
            saveGameState();
            document.getElementById('finalCoins').textContent = `Coins: ${coins}`;
            document.getElementById('coinsDisplay').textContent = `Coins: ${coins}`;
            reviveBtn.disabled = coins < reviveCost;
            gameOverScreen.style.display = 'none';
            reviveGame();
        }
    };
    document.getElementById('restartBtn').onclick = () => {
        gameOverScreen.style.display = 'none';
        startGame();
    };
    document.getElementById('gameOverExitBtn').onclick = () => {
        gameOverScreen.style.display = 'none';
        showStartScreen();
    };
    gameOverScreen.style.display = 'flex';
};

const reviveGame = () => {
    console.log('reviveGame called');
    gameRunning = true;
    gamePaused = false;
    player.isImmune = true;
    player.immunityTime = 2;
    player.velocityX = 0;
    obstacles = obstacles.filter(obstacle => obstacle.y - cameraY > player.y - carHeight / 2);
    lastCoinDistance = -cameraY;
    justRevived = true;
    requestAnimationFrame(gameLoop);
};

const startGame = () => {
    console.log('startGame called');
    canvas.style.display = 'block';
    document.querySelectorAll('.ui').forEach(el => {
        el.style.display = 'block';
        console.log('Showing UI element:', el.id);
    });
    document.querySelector('.speedometer').style.display = 'block';
    document.querySelector('.controls').style.display = 'flex';

    gameRunning = true;
    gamePaused = false;
    score = obstaclesPassed = 0;
    obstacles = [];
    lastCoinDistance = 0;
    player = {
        x: canvas.width / 2 - carWidth / 2,
        y: canvas.height / 2,
        speed: 0,
        angle: 0,
        targetAngle: 0,
        carData: player.carData,
        isImmune: false,
        immunityTime: 0,
        velocityX: 0,
        targetSpeed: 0,
        steeringAngle: 0
    };
    cameraY = 0;
    setInterval(() => {
        if (gameRunning && !gamePaused) {
            createObstacle(0, 'top');
        }
    }, 5000);
    setInterval(() => {
        if (gameRunning && !gamePaused) {
            createObstacle(1, 'top');
        }
    }, 6000);
    setInterval(() => {
        if (gameRunning && !gamePaused) {
            createObstacle(1, 'sameDirection');
        }
    }, 7000);
    gameLoop();
};

document.getElementById('pauseBtn').onclick = () => {
    if (gameRunning) {
        gamePaused = !gamePaused;
        if (!gamePaused) requestAnimationFrame(gameLoop);
    }
};
document.getElementById('exitBtn').onclick = () => {
    gameRunning = gamePaused = false;
    showStartScreen();
};

// Initialize game on load
loadGameState().then(() => {
    showStartScreen();
}).catch(error => {
    console.error('Initialization failed:', error);
    showStartScreen();
});