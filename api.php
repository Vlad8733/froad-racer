<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-cache, must-revalidate');

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$db_host = 'localhost';
$db_user = 'root';
$db_pass = '';
$db_name = 'roadracer';

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    error_log("Database connection successful at " . date('Y-m-d H:i:s'));
} catch (PDOException $e) {
    error_log("Database connection failed at " . date('Y-m-d H:i:s') . ": " . $e->getMessage());
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$action = isset($_GET['action']) ? $_GET['action'] : '';
$user_id = isset($_GET['user_id']) ? $_GET['user_id'] : null;

if ($action === 'register' && $method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $user_id = isset($data['user_id']) ? trim($data['user_id']) : null;
    $email = isset($data['email']) ? trim($data['email']) : null;
    $password = isset($data['password']) ? $data['password'] : null;

    if (!$user_id || !$password) {
        error_log("Registration failed: Missing user_id or password");
        echo json_encode(['error' => 'Nickname and password are required']);
        exit;
    }

    if (strlen($user_id) < 3 || strlen($user_id) > 50) {
        error_log("Registration failed: Invalid nickname length for $user_id");
        echo json_encode(['error' => 'Nickname must be between 3 and 50 characters']);
        exit;
    }

    if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        error_log("Registration failed: Invalid email for $user_id");
        echo json_encode(['error' => 'Invalid email format']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE user_id = ?");
        $stmt->execute([$user_id]);
        if ($stmt->fetchColumn() > 0) {
            error_log("Registration failed: Nickname $user_id already exists");
            echo json_encode(['error' => 'Nickname already exists']);
            exit;
        }

        if ($email) {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE email = ?");
            $stmt->execute([$email]);
            if ($stmt->fetchColumn() > 0) {
                error_log("Registration failed: Email $email already exists");
                echo json_encode(['error' => 'Email already exists']);
                exit;
            }
        }

        $hashed_password = password_hash($password, PASSWORD_DEFAULT);

        $pdo->beginTransaction();

        $stmt = $pdo->prepare("INSERT INTO users (user_id, email, password) VALUES (?, ?, ?)");
        $stmt->execute([$user_id, $email ?: null, $hashed_password]);
        error_log("User $user_id inserted into users table");

        $stmt = $pdo->prepare("INSERT INTO game_state (user_id, coins, high_score, current_car) VALUES (?, 0, 0, 'Default Car')");
        $stmt->execute([$user_id]);
        error_log("Game state inserted for $user_id");

        $stmt = $pdo->prepare("INSERT INTO owned_cars (user_id, car_name) VALUES (?, 'Default Car')");
        $stmt->execute([$user_id]);
        error_log("Owned car inserted for $user_id");

        $pdo->commit();
        error_log("Registration successful for user: $user_id at " . date('Y-m-d H:i:s'));
        echo json_encode(['success' => true, 'message' => 'Registration successful']);
    } catch (PDOException $e) {
        $pdo->rollBack();
        error_log("Registration error for user $user_id at " . date('Y-m-d H:i:s') . ": " . $e->getMessage());
        echo json_encode(['error' => 'Registration error: ' . $e->getMessage()]);
    }
} elseif ($action === 'login' && $method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $user_id = isset($data['user_id']) ? trim($data['user_id']) : null;
    $password = isset($data['password']) ? $data['password'] : null;

    if (!$user_id || !$password) {
        error_log("Login failed: Missing user_id or password");
        echo json_encode(['error' => 'Nickname and password are required']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("SELECT password FROM users WHERE user_id = ?");
        $stmt->execute([$user_id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user && password_verify($password, $user['password'])) {
            error_log("Login successful for user: $user_id at " . date('Y-m-d H:i:s'));
            echo json_encode(['success' => true]);
        } else {
            error_log("Login failed for user: $user_id at " . date('Y-m-d H:i:s'));
            echo json_encode(['error' => 'Invalid nickname or password']);
        }
    } catch (PDOException $e) {
        error_log("Login error for user $user_id at " . date('Y-m-d H:i:s') . ": " . $e->getMessage());
        echo json_encode(['error' => 'Login error: ' . $e->getMessage()]);
    }
} elseif ($action === 'load' && $user_id) {
    try {
        $stmt = $pdo->prepare("SELECT coins, high_score, current_car FROM game_state WHERE user_id = ?");
        $stmt->execute([$user_id]);
        $game_state = $stmt->fetch(PDO::FETCH_ASSOC);

        $stmt = $pdo->prepare("SELECT car_name FROM owned_cars WHERE user_id = ?");
        $stmt->execute([$user_id]);
        $owned_cars = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (!$game_state) {
            $stmt = $pdo->prepare("INSERT INTO game_state (user_id, coins, high_score, current_car) VALUES (?, 0, 0, 'Default Car')");
            $stmt->execute([$user_id]);
            $stmt = $pdo->prepare("INSERT INTO owned_cars (user_id, car_name) VALUES (?, 'Default Car')");
            $stmt->execute([$user_id]);
            $game_state = ['coins' => 0, 'high_score' => 0, 'current_car' => 'Default Car'];
            $owned_cars = ['Default Car'];
        }

        error_log("Game state loaded for user: $user_id at " . date('Y-m-d H:i:s'));
        echo json_encode([
            'coins' => (int)$game_state['coins'],
            'high_score' => (int)$game_state['high_score'],
            'current_car' => $game_state['current_car'],
            'owned_cars' => $owned_cars
        ]);
    } catch (PDOException $e) {
        error_log("Load error for user $user_id at " . date('Y-m-d H:i:s') . ": " . $e->getMessage());
        echo json_encode(['error' => 'Load error: ' . $e->getMessage()]);
    }
} elseif ($action === 'save' && $method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $user_id = isset($data['user_id']) ? $data['user_id'] : null;
    $coins = isset($data['coins']) ? (int)$data['coins'] : 0;
    $high_score = isset($data['high_score']) ? (int)$data['high_score'] : 0;
    $current_car = isset($data['current_car']) ? $data['current_car'] : 'Default Car';
    $owned_cars = isset($data['owned_cars']) ? $data['owned_cars'] : ['Default Car'];

    if (!$user_id) {
        echo json_encode(['error' => 'Invalid user_id']);
        exit;
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("INSERT INTO game_state (user_id, coins, high_score, current_car) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE coins = ?, high_score = ?, current_car = ?");
        $stmt->execute([$user_id, $coins, $high_score, $current_car, $coins, $high_score, $current_car]);

        $stmt = $pdo->prepare("DELETE FROM owned_cars WHERE user_id = ?");
        $stmt->execute([$user_id]);

        $stmt = $pdo->prepare("INSERT INTO owned_cars (user_id, car_name) VALUES (?, ?)");
        foreach ($owned_cars as $car) {
            $stmt->execute([$user_id, $car]);
        }

        $pdo->commit();
        error_log("Game state saved for user: $user_id at " . date('Y-m-d H:i:s'));
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        error_log("Save error for user $user_id at " . date('Y-m-d H:i:s') . ": " . $e->getMessage());
        echo json_encode(['error' => 'Save error: ' . $e->getMessage()]);
    }
} else {
    echo json_encode(['error' => 'Invalid request']);
}
?>