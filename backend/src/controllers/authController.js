const bcrypt = require('bcryptjs');
const validator = require('validator');
const database = require('../config/database');
const authMiddleware = require('../middleware/authMiddleware');

class AuthController {
  // Регистрация пользователя
  async register(req, res) {
    try {
      const { email, username, password, fullName, avatarUrl } = req.body;

      // Валидация входных данных
      const validationErrors = AuthController.validateRegistrationData({
        email, username, password, fullName, avatarUrl
      });

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          errors: validationErrors
        });
      }

      // Проверка существующего пользователя
      const existingUser = await AuthController.findUserByEmailOrUsername(email, username);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: existingUser.email === email 
            ? 'Пользователь с таким email уже существует' 
            : 'Имя пользователя уже занято'
        });
      }

      // Хэширование пароля
      const passwordHash = await bcrypt.hash(password, 10);

      // Создание пользователя
      const user = await AuthController.createUser({
        email,
        username,
        passwordHash,
        fullName,
        avatarUrl
      });

      // Генерация токенов
      const tokens = authMiddleware.generateTokens(user);
      
      // Сохранение refresh токена
      const deviceInfo = authMiddleware.getDeviceInfo(req);
      await authMiddleware.saveRefreshToken(
        user.id, 
        tokens.refreshToken, 
        deviceInfo,
        req.ip
      );

      // Убираем пароль из ответа
      delete user.password_hash;

      res.status(201).json({
        success: true,
        message: 'Пользователь успешно зарегистрирован',
        user: user,
        tokens: tokens,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m'
      });

    } catch (error) {
      console.error('❌ Ошибка регистрации:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при регистрации пользователя'
      });
    }
  }

  // Вход пользователя
  async login(req, res) {
    try {
      const { email, username, password } = req.body;

      // Валидация
      if ((!email && !username) || !password) {
        return res.status(400).json({
          success: false,
          error: 'Укажите email/username и пароль'
        });
      }

      // Поиск пользователя
      const query = email 
        ? 'SELECT * FROM users WHERE email = $1 AND is_active = true'
        : 'SELECT * FROM users WHERE username = $1 AND is_active = true';
      
      const result = await database.pool.query(query, [email || username]);
      
      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Неверные учетные данные'
        });
      }

      const user = result.rows[0];

      // Проверка пароля
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Неверные учетные данные'
        });
      }

      // Обновление времени последнего входа
      await database.pool.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      // Генерация токенов
      const tokens = authMiddleware.generateTokens(user);
      
      // Сохранение refresh токена
      const deviceInfo = authMiddleware.getDeviceInfo(req);
      await authMiddleware.saveRefreshToken(
        user.id, 
        tokens.refreshToken, 
        deviceInfo,
        req.ip
      );

      // Убираем пароль из ответа
      delete user.password_hash;

      res.json({
        success: true,
        message: 'Вход выполнен успешно',
        user: user,
        tokens: tokens,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m'
      });

    } catch (error) {
      console.error('❌ Ошибка входа:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при входе в систему'
      });
    }
  }

  // Обновление токенов
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh токен обязателен'
        });
      }

      // Проверка refresh токена в БД
      const validation = await authMiddleware.validateRefreshToken(refreshToken);
      
      if (!validation.valid) {
        return res.status(401).json({
          success: false,
          error: 'Недействительный refresh токен'
        });
      }

      // Отзыв старого токена
      await authMiddleware.revokeRefreshToken(refreshToken);

      // Генерация новых токенов
      const user = validation.tokenData;
      const newTokens = authMiddleware.generateTokens(user);
      
      // Сохранение нового refresh токена
      const deviceInfo = authMiddleware.getDeviceInfo(req);
      await authMiddleware.saveRefreshToken(
        user.user_id, 
        newTokens.refreshToken, 
        deviceInfo,
        req.ip
      );

      res.json({
        success: true,
        tokens: newTokens,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m'
      });

    } catch (error) {
      console.error('❌ Ошибка обновления токена:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка обновления токена'
      });
    }
  }

  // Выход пользователя
  async logout(req, res) {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        await authMiddleware.revokeRefreshToken(refreshToken);
      }

      res.json({
        success: true,
        message: 'Выход выполнен успешно'
      });

    } catch (error) {
      console.error('❌ Ошибка выхода:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при выходе из системы'
      });
    }
  }

  // Получение профиля пользователя
  async getProfile(req, res) {
    try {
      const userId = req.userId;

      const result = await database.pool.query(`
        SELECT id, email, username, full_name, avatar_url, 
               preferences, is_admin, created_at, last_login
        FROM users 
        WHERE id = $1 AND is_active = true
      `, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Пользователь не найден'
        });
      }

      const user = result.rows[0];
      
      // Получаем статистику пользователя
      const statsResult = await database.pool.query(`
        SELECT 
          COUNT(*) as total_requests,
          COUNT(DISTINCT uf.movie_id) as total_favorites
        FROM users u
        LEFT JOIN recommendation_history rh ON u.id = rh.user_id
        LEFT JOIN user_favorites uf ON u.id = uf.user_id
        WHERE u.id = $1
        GROUP BY u.id
      `, [userId]);

      res.json({
        success: true,
        user: user,
        stats: statsResult.rows[0] || { total_requests: 0, total_favorites: 0 }
      });

    } catch (error) {
      console.error('❌ Ошибка получения профиля:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при получении профиля'
      });
    }
  }

  // Обновление профиля пользователя
  async updateProfile(req, res) {
    try {
      const userId = req.userId;
      const { fullName, avatarUrl, preferences } = req.body;

      // Валидация
      if (fullName && fullName.length > 255) {
        return res.status(400).json({
          success: false,
          error: 'Имя слишком длинное (макс. 255 символов)'
        });
      }

      if (avatarUrl && !validator.isURL(avatarUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Некорректный URL аватара'
        });
      }

      // Обновление профиля
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (fullName !== undefined) {
        updates.push(`full_name = $${paramCount}`);
        values.push(fullName);
        paramCount++;
      }

      if (avatarUrl !== undefined) {
        updates.push(`avatar_url = $${paramCount}`);
        values.push(avatarUrl);
        paramCount++;
      }

      if (preferences !== undefined) {
        updates.push(`preferences = $${paramCount}`);
        values.push(JSON.stringify(preferences));
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Нет данных для обновления'
        });
      }

      values.push(userId);
      
      const query = `
        UPDATE users 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount} AND is_active = true
        RETURNING id, email, username, full_name, avatar_url, 
                  preferences, is_admin, created_at, updated_at
      `;

      const result = await database.pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Пользователь не найден'
        });
      }

      res.json({
        success: true,
        message: 'Профиль успешно обновлен',
        user: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Ошибка обновления профиля:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при обновлении профиля'
      });
    }
  }

  // Валидация данных регистрации (статические методы)
  static validateRegistrationData(data) {
    const errors = [];

    if (!data.email || !validator.isEmail(data.email)) {
      errors.push('Некорректный email');
    }

    if (!data.username || data.username.length < 3 || data.username.length > 100) {
      errors.push('Имя пользователя должно быть от 3 до 100 символов');
    }

    if (!data.password || data.password.length < 6) {
      errors.push('Пароль должен быть не менее 6 символов');
    }

    if (data.fullName && data.fullName.length > 255) {
      errors.push('Полное имя слишком длинное (макс. 255 символов)');
    }

    if (data.avatarUrl && !validator.isURL(data.avatarUrl)) {
      errors.push('Некорректный URL аватара');
    }

    return errors;
  }

  // Поиск пользователя по email или username (статические методы)
  static async findUserByEmailOrUsername(email, username) {
    try {
      const result = await database.pool.query(`
        SELECT id, email, username 
        FROM users 
        WHERE email = $1 OR username = $2
        LIMIT 1
      `, [email, username]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Ошибка поиска пользователя:', error);
      return null;
    }
  }

  // Создание пользователя в БД (статические методы)
  static async createUser(userData) {
    const query = `
      INSERT INTO users (email, username, password_hash, full_name, avatar_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, username, full_name, avatar_url, 
                preferences, is_admin, created_at
    `;

    const result = await database.pool.query(query, [
      userData.email,
      userData.username,
      userData.passwordHash,
      userData.fullName || null,
      userData.avatarUrl || null
    ]);

    return result.rows[0];
  }
}

module.exports = new AuthController();