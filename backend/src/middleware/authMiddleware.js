const jwt = require('jsonwebtoken');
const database = require('../config/database');

class AuthMiddleware {
  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    this.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production';
    this.ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
    this.REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';
  }

  // Генерация токенов
  generateTokens(user) {
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        username: user.username,
        isAdmin: user.is_admin || false
      },
      this.JWT_SECRET,
      { expiresIn: this.ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        type: 'refresh'
      },
      this.JWT_REFRESH_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRY }
    );

    return { accessToken, refreshToken };
  }

  // Валидация access token
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.JWT_SECRET);
    } catch (error) {
      console.error('❌ Ошибка верификации токена:', error.message);
      return null;
    }
  }

  // Валидация refresh token
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.JWT_REFRESH_SECRET);
    } catch (error) {
      return null;
    }
  }

  // Middleware для проверки аутентификации
  authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Требуется аутентификация. Используйте формат: Bearer <token>'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = this.verifyAccessToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Неверный или истекший токен'
      });
    }

    req.user = decoded;
    req.userId = decoded.userId;
    next();
  }

  // Middleware для проверки администратора
  requireAdmin = (req, res, next) => {
    this.authenticate(req, res, () => {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Требуются права администратора'
        });
      }
      next();
    });
  }

  // Middleware для опциональной аутентификации
  optionalAuthenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = this.verifyAccessToken(token);
      
      if (decoded) {
        req.user = decoded;
        req.userId = decoded.userId;
        req.isAuthenticated = true;
      } else {
        req.isAuthenticated = false;
      }
    } else {
      req.isAuthenticated = false;
    }
    next();
  }

  // Сохранение refresh токена в БД
  async saveRefreshToken(userId, token, deviceInfo = null, ipAddress = null) {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 дней
      
      const query = `
        INSERT INTO refresh_tokens (user_id, token, expires_at, device_info, ip_address)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;
      
      const result = await database.pool.query(query, [
        userId,
        token,
        expiresAt,
        deviceInfo,
        ipAddress
      ]);
      
      return { success: true, id: result.rows[0].id };
    } catch (error) {
      console.error('❌ Ошибка сохранения refresh токена:', error);
      return { success: false, error: error.message };
    }
  }

  // Отзыв refresh токена
  async revokeRefreshToken(token) {
    try {
      const query = `
        UPDATE refresh_tokens 
        SET is_revoked = true 
        WHERE token = $1 
        RETURNING id
      `;
      
      const result = await database.pool.query(query, [token]);
      
      return { 
        success: true, 
        revoked: result.rowCount > 0 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Проверка валидности refresh токена в БД
  async validateRefreshToken(token) {
    try {
      const query = `
        SELECT rt.*, u.id as user_id, u.email, u.username, u.is_admin
        FROM refresh_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token = $1 
          AND rt.expires_at > CURRENT_TIMESTAMP 
          AND rt.is_revoked = false
          AND u.is_active = true
      `;
      
      const result = await database.pool.query(query, [token]);
      
      if (result.rows.length === 0) {
        return { valid: false };
      }
      
      return { 
        valid: true, 
        tokenData: result.rows[0] 
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // Получение информации об устройстве из заголовков
  getDeviceInfo(req) {
    const userAgent = req.get('User-Agent') || 'Unknown';
    const deviceInfo = {
      userAgent: userAgent,
      platform: req.get('sec-ch-ua-platform') || 'Unknown',
      isMobile: /mobile/i.test(userAgent),
      ip: req.ip || req.connection.remoteAddress
    };
    
    return JSON.stringify(deviceInfo);
  }
}

module.exports = new AuthMiddleware();