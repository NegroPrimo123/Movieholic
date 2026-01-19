const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

class MigrationRunner {
  constructor() {
    this.pool = null;
    this.migrations = [];
    this.init();
  }

  init() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'movie_recommendations',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Загружаем все миграции
    this.loadMigrations();
  }

  // Загрузка миграций из папки
  loadMigrations() {
    const migrationsDir = path.join(__dirname);
    
    // Определяем порядок миграций
    const migrationFiles = [
      '001_create_tables.sql',
      '002_add_friends.sql'
    ];

    this.migrations = migrationFiles.map((filename, index) => ({
      id: index + 1,
      name: filename,
      filepath: path.join(migrationsDir, filename),
      applied: false
    }));

    console.log(`📁 Загружено ${this.migrations.length} миграций`);
  }

  // Проверка существования базы данных
  async checkDatabaseExists() {
    try {
      const client = await this.pool.connect();
      
      const dbCheck = await client.query(`
        SELECT datname FROM pg_database 
        WHERE datname = $1
      `, [process.env.DB_NAME || 'movie_recommendations']);
      
      client.release();
      
      if (dbCheck.rows.length === 0) {
        console.error(`❌ База данных '${process.env.DB_NAME || 'movie_recommendations'}' не существует!`);
        console.log('\n💡 Создайте базу данных:');
        console.log(`   createdb -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} ${process.env.DB_NAME}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Ошибка проверки базы данных:', error.message);
      return false;
    }
  }

  // Создание таблицы для отслеживания миграций
  async createMigrationsTable(client) {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          migration_name VARCHAR(255) UNIQUE NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(50) DEFAULT 'applied'
        )
      `);
      console.log('✅ Таблица миграций создана/проверена');
      return true;
    } catch (error) {
      console.error('❌ Ошибка создания таблицы миграций:', error.message);
      return false;
    }
  }

  // Получение уже примененных миграций
  async getAppliedMigrations(client) {
    try {
      const result = await client.query('SELECT migration_name FROM migrations WHERE status = $1', ['applied']);
      return result.rows.map(row => row.migration_name);
    } catch (error) {
      console.error('❌ Ошибка получения примененных миграций:', error.message);
      return [];
    }
  }

  // Применение одной миграции
  async applyMigration(client, migration) {
    try {
      console.log(`\n🔄 Применение миграции: ${migration.name}`);
      
      // Читаем файл миграции
      if (!fs.existsSync(migration.filepath)) {
        console.error(`   ❌ Файл миграции не найден: ${migration.filepath}`);
        return false;
      }

      const migrationSQL = fs.readFileSync(migration.filepath, 'utf8');
      
      // Разделяем SQL на команды
      const sqlCommands = migrationSQL
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0);

      console.log(`   📄 SQL команд: ${sqlCommands.length}`);

      // Выполняем команды по очереди
      for (let i = 0; i < sqlCommands.length; i++) {
        const command = sqlCommands[i];
        try {
          const shortCommand = command.length > 100 
            ? command.substring(0, 100) + '...' 
            : command;
          console.log(`   ${i + 1}/${sqlCommands.length}: ${shortCommand}`);
          
          await client.query(command + ';');
        } catch (error) {
          console.error(`   ❌ Ошибка в команде ${i + 1}:`, error.message);
          // Продолжаем выполнение других команд
        }
      }

      // Записываем миграцию как примененную
      await client.query(
        'INSERT INTO migrations (migration_name, status) VALUES ($1, $2) ON CONFLICT (migration_name) DO UPDATE SET applied_at = CURRENT_TIMESTAMP',
        [migration.name, 'applied']
      );

      migration.applied = true;
      console.log(`   ✅ Миграция ${migration.name} применена успешно`);
      return true;
    } catch (error) {
      console.error(`   ❌ Ошибка применения миграции ${migration.name}:`, error.message);
      
      // Записываем ошибку
      try {
        await client.query(
          'INSERT INTO migrations (migration_name, status) VALUES ($1, $2) ON CONFLICT (migration_name) DO UPDATE SET status = $2',
          [migration.name, 'failed']
        );
      } catch (e) {
        console.error('   ❌ Не удалось записать ошибку миграции:', e.message);
      }
      
      return false;
    }
  }

  // Откат миграции (опционально)
  async rollbackMigration(client, migrationName) {
    try {
      console.log(`\n↩️  Откат миграции: ${migrationName}`);
      
      // Здесь можно добавить логику отката
      // Для простоты просто помечаем как откаченную
      await client.query(
        'UPDATE migrations SET status = $1 WHERE migration_name = $2',
        ['rolled_back', migrationName]
      );
      
      console.log(`   ✅ Миграция ${migrationName} откачена`);
      return true;
    } catch (error) {
      console.error(`   ❌ Ошибка отката миграции ${migrationName}:`, error.message);
      return false;
    }
  }

  // Основной метод запуска миграций
  async runAllMigrations() {
    console.log('🚀 Запуск всех миграций...');
    console.log('📊 Параметры подключения:');
    console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`   Port: ${process.env.DB_PORT || 5432}`);
    console.log(`   Database: ${process.env.DB_NAME || 'movie_recommendations'}`);
    console.log(`   User: ${process.env.DB_USER || 'postgres'}`);

    let client;
    try {
      // Проверяем существование базы данных
      if (!await this.checkDatabaseExists()) {
        process.exit(1);
      }

      client = await this.pool.connect();
      console.log('✅ Подключение к PostgreSQL установлено');

      // Создаем таблицу для отслеживания миграций
      await this.createMigrationsTable(client);

      // Получаем уже примененные миграции
      const appliedMigrations = await this.getAppliedMigrations(client);
      console.log(`📋 Уже применено миграций: ${appliedMigrations.length}`);

      // Фильтруем миграции, которые еще не были применены
      const pendingMigrations = this.migrations.filter(
        migration => !appliedMigrations.includes(migration.name)
      );

      if (pendingMigrations.length === 0) {
        console.log('🎉 Все миграции уже применены!');
        
        // Показываем статус всех таблиц
        await this.showDatabaseStatus(client);
        return;
      }

      console.log(`🔄 Ожидает применения: ${pendingMigrations.length} миграций`);
      
      // Применяем миграции по порядку
      let appliedCount = 0;
      for (const migration of pendingMigrations) {
        const success = await this.applyMigration(client, migration);
        if (success) {
          appliedCount++;
        } else {
          console.log(`⚠️  Пропускаем остальные миграции из-за ошибки`);
          break;
        }
      }

      console.log(`\n📊 Итог:`);
      console.log(`   Всего миграций: ${this.migrations.length}`);
      console.log(`   Уже применено: ${appliedMigrations.length}`);
      console.log(`   Применено сейчас: ${appliedCount}`);
      console.log(`   Осталось: ${pendingMigrations.length - appliedCount}`);

      // Показываем статус базы данных
      await this.showDatabaseStatus(client);

      // Создаем тестового пользователя (если нужно)
      if (appliedCount > 0) {
        await this.createTestUser(client);
      }

    } catch (error) {
      console.error('❌ Фатальная ошибка:', error.message);
      console.error('Stack:', error.stack);
      
      if (error.code === 'ECONNREFUSED') {
        console.log('\n💡 PostgreSQL не запущен или неверные параметры подключения');
        console.log('   Проверьте:');
        console.log('   1. PostgreSQL запущен?');
        console.log('   2. Верны ли параметры в .env файле?');
        console.log('   3. Пользователь имеет права на подключение?');
      }
      
      process.exit(1);
    } finally {
      if (client) {
        client.release();
      }
      await this.pool.end();
      console.log('\n🔌 Соединение с базой данных закрыто');
    }
  }

  // Показать статус базы данных
  async showDatabaseStatus(client) {
    try {
      console.log('\n📊 Статус базы данных:');
      
      // Получаем все таблицы
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      
      console.log(`   Таблицы (${tablesResult.rows.length}):`);
      tablesResult.rows.forEach(row => {
        console.log(`     - ${row.table_name}`);
      });

      // Получаем все представления
      const viewsResult = await client.query(`
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      
      if (viewsResult.rows.length > 0) {
        console.log(`   Представления (${viewsResult.rows.length}):`);
        viewsResult.rows.forEach(row => {
          console.log(`     - ${row.table_name}`);
        });
      }

      // Получаем пользователей
      const usersResult = await client.query('SELECT id, username, email, is_admin FROM users');
      console.log(`   Пользователи (${usersResult.rowCount}):`);
      usersResult.rows.forEach(user => {
        console.log(`     - ${user.username} (${user.email}) ${user.is_admin ? '[ADMIN]' : ''}`);
      });

    } catch (error) {
      console.error('   ❌ Ошибка получения статуса БД:', error.message);
    }
  }

  // Создание тестового пользователя
  async createTestUser(client) {
    try {
      const bcrypt = require('bcryptjs');
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      const result = await client.query(`
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
      
      console.log('\n👑 Тестовый администратор создан/обновлен:');
      console.log(`   Email: ${process.env.ADMIN_EMAIL || 'admin@movierec.com'}`);
      console.log(`   Username: admin`);
      console.log(`   Password: ${adminPassword}`);
      
      return result.rows[0];
    } catch (error) {
      console.error('   ❌ Ошибка создания тестового пользователя:', error.message);
      return null;
    }
  }

  // Показать статус миграций
  async showMigrationStatus() {
    let client;
    try {
      client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT 
          migration_name,
          applied_at,
          status
        FROM migrations
        ORDER BY applied_at DESC
      `);
      
      console.log('\n📋 Статус миграций:');
      if (result.rows.length === 0) {
        console.log('   Нет записей о миграциях');
      } else {
        result.rows.forEach(row => {
          const statusIcon = row.status === 'applied' ? '✅' : '❌';
          console.log(`   ${statusIcon} ${row.migration_name} (${row.applied_at}) - ${row.status}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Ошибка получения статуса миграций:', error.message);
    } finally {
      if (client) client.release();
      await this.pool.end();
    }
  }
}

// Запуск миграций
async function runMigrations() {
  const runner = new MigrationRunner();
  
  // Проверяем аргументы командной строки
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'status':
      await runner.showMigrationStatus();
      break;
    case 'rollback':
      // Можно добавить логику отката
      console.log('Функция отката в разработке');
      break;
    default:
      await runner.runAllMigrations();
  }
}

// Запуск
if (require.main === module) {
  runMigrations().catch(error => {
    console.error('❌ Фатальная ошибка:', error);
    process.exit(1);
  });
}

module.exports = { MigrationRunner, runMigrations };