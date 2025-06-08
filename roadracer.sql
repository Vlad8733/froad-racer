CREATE TABLE users (
    user_id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE game_state (
    user_id VARCHAR(50) PRIMARY KEY,
    coins INT DEFAULT 0,
    high_score INT DEFAULT 0,
    current_car VARCHAR(50) DEFAULT 'Default Car',
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE owned_cars (
    user_id VARCHAR(50),
    car_name VARCHAR(50),
    PRIMARY KEY (user_id, car_name),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);