const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
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

const pool = new Pool(poolConfig);

// Тестируем соединение
pool.on('connect', () => {
  console.log('✅ Подключение к PostgreSQL установлено');
});

pool.on('error', (err) => {
  console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
});

// Функция для тестирования соединения
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('📊 PostgreSQL подключен успешно');
    client.release();
  } catch (error) {
    console.error('❌ Ошибка подключения к PostgreSQL:', error.message);
    console.log('💡 Проверьте:');
    console.log('1. Запущен ли PostgreSQL (docker-compose up -d)');
    console.log('2. Правильные ли параметры в .env файле');
    console.log('3. Существует ли база данных movie_recommendations');
  }
};

// Тестируем при старте
if (require.main === module) {
  testConnection();
}

module.exports = pool;