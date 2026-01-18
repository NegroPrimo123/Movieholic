const { Pool } = require('pg');
require('dotenv').config();

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    const poolConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'movie_recommendations',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    // Добавляем SSL для продакшена
    if (process.env.NODE_ENV === 'production') {
      poolConfig.ssl = {
        rejectUnauthorized: false
      };
    }

    this.pool = new Pool(poolConfig);

    // Обработчики событий
    this.pool.on('connect', () => {
      console.log('✅ Подключение к PostgreSQL установлено');
      this.isConnected = true;
    });

    this.pool.on('error', (err) => {
      console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
      this.isConnected = false;
    });
  }

  // Тестирование соединения
  async testConnection() {
    try {
      const client = await this.pool.connect();
      console.log('📊 PostgreSQL подключен успешно');
      
      // Проверяем существование таблиц
      const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      console.log(`📋 Найдено таблиц: ${tables.rows.length}`);
      
      client.release();
      return { connected: true, tables: tables.rows.length };
    } catch (error) {
      console.error('❌ Ошибка подключения к PostgreSQL:', error.message);
      
      if (error.code === '3D000') {
        console.log('💡 База данных не существует. Создайте ее:');
        console.log('   createdb movie_recommendations');
      }
      
      return { connected: false, error: error.message };
    }
  }

  // Получить историю
  async getHistory(userId = 'anonymous', limit = 10) {
    try {
      const query = `
        SELECT id, with_whom, when_time, purpose, show_only, 
               movies_count, created_at
        FROM recommendation_history 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `;
      
      const result = await this.pool.query(query, [userId, limit]);
      return { success: true, data: result.rows };
    } catch (error) {
      console.error('❌ Ошибка получения истории:', error);
      return { success: false, error: error.message };
    }
  }

  // Сохранить запрос
  async saveRequest(data) {
    try {
      const query = `
        INSERT INTO recommendation_history 
        (user_id, with_whom, when_time, purpose, show_only, movies_count)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;
      
      const values = [
        data.userId || 'anonymous',
        data.with_whom,
        data.when_time,
        data.purpose,
        data.show_only || null,
        data.movies_count
      ];
      
      const result = await this.pool.query(query, values);
      return { success: true, id: result.rows[0].id };
    } catch (error) {
      console.error('❌ Ошибка сохранения запроса:', error);
      return { success: false, error: error.message };
    }
  }

  // Получить статистику
  async getStats(days = 30) {
    try {
      // Общая статистика
      const totalQuery = await this.pool.query(`
        SELECT 
          COUNT(*) as total_requests,
          COUNT(DISTINCT user_id) as unique_users,
          SUM(movies_count) as total_movies_recommended,
          AVG(movies_count) as avg_movies_per_request
        FROM recommendation_history
      `);
      
      // Статистика за период
      const periodQuery = await this.pool.query(`
        SELECT 
          COUNT(*) as recent_requests,
          COUNT(DISTINCT user_id) as recent_users
        FROM recommendation_history
        WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      `);
      
      // Популярные сценарии
      const popularQuery = await this.pool.query(`
        SELECT with_whom, COUNT(*) as count
        FROM recommendation_history
        GROUP BY with_whom
        ORDER BY count DESC
        LIMIT 1
      `);
      
      return {
        success: true,
        stats: {
          total_requests: parseInt(totalQuery.rows[0]?.total_requests || 0),
          unique_users: parseInt(totalQuery.rows[0]?.unique_users || 0),
          total_movies_recommended: parseInt(totalQuery.rows[0]?.total_movies_recommended || 0),
          avg_movies_per_request: parseFloat(totalQuery.rows[0]?.avg_movies_per_request || 0).toFixed(1),
          recent_requests: parseInt(periodQuery.rows[0]?.recent_requests || 0),
          recent_users: parseInt(periodQuery.rows[0]?.recent_users || 0),
          most_popular_scenario: popularQuery.rows[0]?.with_whom || 'нет данных',
          last_updated: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('❌ Ошибка получения статистики:', error);
      return { success: false, error: error.message };
    }
  }

  // Закрыть соединения
  async close() {
    await this.pool.end();
    this.isConnected = false;
  }
}

// Создаем singleton экземпляр
const database = new Database();

// Тестируем при старте
if (require.main === module) {
  setTimeout(async () => {
    await database.testConnection();
  }, 1000);
}

module.exports = database;