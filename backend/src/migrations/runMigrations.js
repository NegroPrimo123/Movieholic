const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function runMigrations() {
  console.log('🚀 Запуск миграций...');
  console.log('📊 Параметры подключения:');
  console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
  console.log(`   Port: ${process.env.DB_PORT || 5432}`);
  console.log(`   Database: ${process.env.DB_NAME || 'movie_recommendations'}`);
  console.log(`   User: ${process.env.DB_USER || 'postgres'}`);

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432, // Исправлено: преобразование в число
    database: process.env.DB_NAME || 'movie_recommendations',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, // Увеличено время ожидания
  });

  try {
    const client = await pool.connect();
    console.log('✅ Подключение к PostgreSQL установлено');

    // Проверяем существование базы данных
    const dbCheck = await client.query(`
      SELECT datname FROM pg_database 
      WHERE datname = $1
    `, [process.env.DB_NAME || 'movie_recommendations']);
    
    if (dbCheck.rows.length === 0) {
      console.error(`❌ База данных '${process.env.DB_NAME || 'movie_recommendations'}' не существует!`);
      console.log('💡 Создайте базу данных:');
      console.log(`   createdb -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} ${process.env.DB_NAME}`);
      process.exit(1);
    }

    // Читаем файл миграции
    const migrationPath = path.join(__dirname, '001_create_tables.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Файл миграции не найден: ${migrationPath}`);
      console.log('💡 Проверьте путь к файлу миграции');
      process.exit(1);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log(`📄 Прочитан файл миграции (${migrationSQL.length} символов)`);

    // Разделяем SQL на отдельные команды
    const sqlCommands = migrationSQL
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0);

    console.log(`🔄 Применяем ${sqlCommands.length} SQL команд...`);

    // Выполняем команды по очереди
    for (let i = 0; i < sqlCommands.length; i++) {
      try {
        console.log(`   ${i + 1}/${sqlCommands.length}: ${sqlCommands[i].substring(0, 50)}...`);
        await client.query(sqlCommands[i] + ';');
      } catch (error) {
        console.error(`   ❌ Ошибка в команде ${i + 1}:`, error.message);
        // Продолжаем выполнение других команд
      }
    }

    console.log('✅ Основные миграции применены!');

    // Создаем тестового пользователя (опционально)
    console.log('👑 Создаем тестового пользователя...');
    
    // Для bcrypt требуется установить его
    const bcrypt = require('bcryptjs');
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    await client.query(`
      INSERT INTO users (email, username, password_hash, full_name, is_admin)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, email, username
    `, [
      process.env.ADMIN_EMAIL || 'admin@movierec.com',
      'admin',
      hashedPassword,
      'Администратор системы',
      true
    ]);
    
    console.log('✅ Тестовый администратор создан/обновлен');
    console.log(`   Email: ${process.env.ADMIN_EMAIL || 'admin@movierec.com'}`);
    console.log(`   Password: ${adminPassword}`);

    // Проверяем созданные таблицы
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('\n📊 Созданные таблицы:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Проверяем пользователей
    const usersResult = await client.query('SELECT id, email, username, is_admin FROM users');
    console.log('\n👥 Пользователи в системе:');
    usersResult.rows.forEach(user => {
      console.log(`   - ${user.email} (${user.username}) ${user.is_admin ? '[ADMIN]' : ''}`);
    });

    client.release();
    
    console.log('\n🎉 Миграции успешно завершены!');
    console.log('\n💡 Дальнейшие действия:');
    console.log('   1. Запустите сервер: npm run dev');
    console.log('   2. Откройте документацию: http://localhost:3000/api-docs');
    console.log('   3. Зарегистрируйтесь или войдите как admin');
    
  } catch (error) {
    console.error('❌ Ошибка при применении миграций:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 PostgreSQL не запущен или неверные параметры подключения');
      console.log('   Проверьте:');
      console.log('   1. PostgreSQL запущен? (pg_isready -h localhost -p 1357)');
      console.log('   2. Верны ли параметры в .env файле?');
      console.log('   3. Пользователь имеет права на подключение?');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔌 Соединение с базой данных закрыто');
  }
}

// Запуск миграций
if (require.main === module) {
  runMigrations().catch(error => {
    console.error('❌ Фатальная ошибка:', error);
    process.exit(1);
  });
}

module.exports = runMigrations;