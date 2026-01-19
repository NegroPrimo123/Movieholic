const axios = require('axios');
const database = require('../config/database');

// Константы для валидации
const VALID_OPTIONS = {
  WITH_WHOM: ['Один', 'С партнером (романтика)', 'С партнером (экшн)', 'С детьми', 'С друзьями (чтобы обсудить)', 'С друзьями (фоном)'],
  WHEN_TIME: ['Пятничный вечер', 'Воскресное утро', 'Ночью после работы', 'В отпуске'],
  PURPOSE: ['Отдохнуть мозгом', 'Вдохновиться', 'Пощекотать нервы', 'Порефлексировать'],
  SHOW_ONLY: ['малоизвестное', 'культовое', 'артхаус']
};

// Маппинг сценария на жанры Кинопоиска
const GENRE_MAP = {
  'Один': ['драма', 'биография'],
  'С партнером (романтика)': ['мелодрама', 'комедия'],
  'С партнером (экшн)': ['боевик', 'триллер'],
  'С детьми': ['мультфильм', 'семейный'],
  'С друзьями (чтобы обсудить)': ['фантастика', 'детектив'],
  'С друзьями (фоном)': ['комедия', 'приключения']
};

// Маппинг на английские жанры для API
const GENRE_EN_MAP = {
  'драма': 'drama',
  'биография': 'biography',
  'мелодрама': 'melodrama',
  'комедия': 'comedy',
  'боевик': 'action',
  'триллер': 'thriller',
  'мультфильм': 'cartoon',
  'семейный': 'family',
  'фантастика': 'sci-fi',
  'детектив': 'detective',
  'приключения': 'adventure'
};

class RecommendationsController {
  
  // Валидация сценария
  validateScenario(scenario) {
    if (!scenario.with_whom || !scenario.when_time || !scenario.purpose) {
      throw new Error('Нужно указать: с кем, когда и цель');
    }
    
    const validOptions = {
      with_whom: VALID_OPTIONS.WITH_WHOM,
      when_time: VALID_OPTIONS.WHEN_TIME,
      purpose: VALID_OPTIONS.PURPOSE
    };
    
    for (const [key, options] of Object.entries(validOptions)) {
      if (scenario[key] && !options.includes(scenario[key])) {
        throw new Error(`Недопустимое значение для ${key}: ${scenario[key]}. Допустимые значения: ${options.join(', ')}`);
      }
    }
    
    if (scenario.show_only && !VALID_OPTIONS.SHOW_ONLY.includes(scenario.show_only)) {
      throw new Error(`Недопустимое значение для show_only: ${scenario.show_only}. Допустимые значения: ${VALID_OPTIONS.SHOW_ONLY.join(', ')}`);
    }
    
    return true;
  }

  // Получение жанров по сценарию
  getGenresByScenario(scenario) {
    const russianGenres = GENRE_MAP[scenario.with_whom] || ['драма'];
    const englishGenres = russianGenres.map(g => GENRE_EN_MAP[g] || g);
    
    return {
      russian: russianGenres,
      english: englishGenres
    };
  }

  // Получение фильмов из API Кинопоиска с рандомизацией
  async fetchMoviesFromAPI(genres, scenario) {
    const API_KEY = process.env.KINOPOISK_API_KEY;
  
    if (!API_KEY) {
      throw new Error('API ключ Кинопоиска не настроен. Установите KINOPOISK_API_KEY в .env');
    }
    
    const BASE_URL = 'https://api.kinopoisk.dev/v1.4/movie';
    
    // Генерируем случайную страницу (для разнообразия)
    const randomPage = Math.floor(Math.random() * 5) + 1;
    
    let params = {
      limit: 30, // Берем больше фильмов для дальнейшей рандомизации
      page: randomPage, // Случайная страница
      selectFields: ['id', 'name', 'alternativeName', 'enName', 'year', 'rating', 'poster', 'genres', 'description', 'votes'],
      token: API_KEY
    };
    
    // Добавляем жанры
    if (genres.english.length > 0) {
      params.genres = genres.english;
    }
    
    // Настройка на основе show_only
    if (scenario.show_only === 'культовое') {
      params['rating.kp'] = '7.5-10';
      params.sortField = 'votes.kp';
      params.sortType = '-1';
    } else if (scenario.show_only === 'малоизвестное') {
      params['rating.kp'] = '6-8';
      params['votes.kp'] = '100-10000';
    } else if (scenario.show_only === 'артхаус') {
      params.genres = ['артхаус', 'документальный'];
      params.sortField = 'year';
      params.sortType = '-1';
    } else {
      // Стандартные настройки с рандомной сортировкой
      params['rating.kp'] = '6.5-10';
      params.year = '2010-2024';
      
      // Добавляем случайный порядок для разнообразия
      const sortOptions = [
        { field: 'rating.kp', type: '-1' },
        { field: 'votes.kp', type: '-1' },
        { field: 'year', type: '-1' },
        { field: 'year', type: '1' }
      ];
      
      const randomSort = sortOptions[Math.floor(Math.random() * sortOptions.length)];
      params.sortField = randomSort.field;
      params.sortType = randomSort.type;
    }
    
    try {
      console.log(`📡 Запрос к API Кинопоиска:`, {
        genres: genres.english,
        page: randomPage,
        sort: `${params.sortField} ${params.sortType}`
      });
      
      const response = await axios.get(BASE_URL, {
        params: params,
        headers: {
          'X-API-KEY': API_KEY
        },
        timeout: 15000
      });
      
      if (!response.data || !response.data.docs) {
        throw new Error('Некорректный ответ от API Кинопоиска');
      }
      
      const movies = response.data.docs;
      
      if (movies.length === 0) {
        throw new Error('По вашему запросу не найдено фильмов');
      }
      
      return movies;
    } catch (apiError) {
      console.error('❌ Ошибка API Кинопоиска:', {
        message: apiError.message,
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        url: apiError.config?.url
      });
      
      // Формируем понятное сообщение об ошибке
      let errorMessage = 'Ошибка получения данных от сервиса рекомендаций';
      
      if (apiError.response?.status === 401 || apiError.response?.status === 403) {
        errorMessage = 'Неверный или отсутствующий API ключ Кинопоиска';
      } else if (apiError.response?.status === 429) {
        errorMessage = 'Превышен лимит запросов к API Кинопоиска';
      } else if (apiError.code === 'ECONNREFUSED' || apiError.code === 'ETIMEDOUT') {
        errorMessage = 'Сервис рекомендаций временно недоступен';
      }
      
      throw new Error(errorMessage);
    }
  }

  // Метод для случайного перемешивания массива (Fisher-Yates shuffle)
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Фильтрация фильмов
  filterMovies(movies, scenario) {
    let filteredMovies = movies;
    
    // Дополнительная фильтрация по рейтингу
    if (scenario.show_only === 'культовое') {
      filteredMovies = movies.filter(m => m.rating?.kp > 7.5);
    } else if (scenario.show_only === 'малоизвестное') {
      filteredMovies = movies.filter(m => !m.votes || m.votes.kp < 10000);
    }
    
    return filteredMovies;
  }

  // Форматирование фильмов
  formatMovies(movies) {
    return movies.map(movie => ({
      id: movie.id,
      title: movie.name || movie.alternativeName || 'Без названия',
      originalTitle: movie.alternativeName || movie.enName || '',
      year: movie.year || 'Неизвестно',
      rating: movie.rating?.kp ? parseFloat(movie.rating.kp.toFixed(1)) : null,
      genres: movie.genres?.map(g => g.name) || [],
      poster: movie.poster?.url || 'https://via.placeholder.com/300x450?text=No+Poster',
      description: movie.description ? 
        (movie.description.length > 200 ? movie.description.substring(0, 200) + '...' : movie.description) : 
        'Описание отсутствует',
      votes: movie.votes?.kp || 0
    }));
  }

  // Сохранить фильм как просмотренный (для системы друзей)
  async saveWatchedMovie(userId, movieData, rating = null, comment = null) {
    try {
      // Сохраняем в отдельную таблицу для истории просмотров пользователя
      const query = `
        INSERT INTO user_watched_movies 
        (user_id, movie_id, movie_title, movie_poster, rating, comment)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, movie_id) DO UPDATE SET
          watched_at = CURRENT_TIMESTAMP,
          rating = EXCLUDED.rating,
          comment = EXCLUDED.comment
        RETURNING id
      `;
      
      const result = await database.pool.query(query, [
        userId,
        movieData.id,
        movieData.title,
        movieData.poster,
        rating,
        comment
      ]);
      
      return { success: true, id: result.rows[0].id };
    } catch (error) {
      console.error('❌ Ошибка сохранения просмотренного фильма:', error);
      return { success: false, error: error.message };
    }
  }

  // Основной метод получения рекомендаций (обновленный)
  async getRecommendations(req, res) {
    try {
      console.log('📥 Запрос рекомендаций:', req.body);
      
      const scenario = req.body;
      const userId = req.headers['x-user-id'] || 'anonymous';
      const authenticatedUserId = req.userId || null;
      
      // Валидация сценария
      this.validateScenario(scenario);
      
      // Получаем жанры по сценарию
      const genres = this.getGenresByScenario(scenario);
      console.log(`🎭 Выбранные жанры: ${genres.russian.join(', ')}`);
      
      // Проверяем наличие API ключа
      if (!process.env.KINOPOISK_API_KEY) {
        console.error('❌ KINOPOISK_API_KEY не установлен');
        return res.status(400).json({
          success: false,
          error: 'Сервис временно недоступен. API ключ не настроен.',
          help: 'Установите KINOPOISK_API_KEY в .env файле'
        });
      }
      
      // Получаем фильмы из API Кинопоиска
      let movies;
      try {
        movies = await this.fetchMoviesFromAPI(genres, scenario);
        console.log(`✅ Получено ${movies.length} фильмов от API Кинопоиска`);
      } catch (apiError) {
        console.error('❌ Ошибка API Кинопоиска:', apiError.message);
        return res.status(503).json({
          success: false,
          error: 'Сервис рекомендаций временно недоступен',
          details: apiError.message.includes('API ключ') 
            ? 'Неверный или отсутствующий API ключ' 
            : 'Ошибка подключения к сервису рекомендаций',
          help: 'Попробуйте позже или свяжитесь с поддержкой',
          timestamp: new Date().toISOString()
        });
      }
      
      // Проверяем, что API вернуло фильмы
      if (!movies || movies.length === 0) {
        console.warn('⚠️ API вернуло пустой список фильмов');
        return res.status(404).json({
          success: false,
          error: 'По вашему запросу не найдено подходящих фильмов',
          scenario: scenario,
          suggestions: [
            'Попробуйте изменить параметры запроса',
            'Используйте менее строгие фильтры',
            'Попробуйте другой сценарий просмотра'
          ]
        });
      }
      
      // Фильтрация по дополнительным параметрам
      const filteredMovies = this.filterMovies(movies, scenario);
      console.log(`🎬 После фильтрации: ${filteredMovies.length} фильмов`);
      
      // Проверяем, что остались фильмы после фильтрации
      if (filteredMovies.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Не найдено фильмов, соответствующих вашему запросу',
          scenario: scenario,
          appliedFilters: {
            show_only: scenario.show_only,
            genres: genres.russian
          },
          suggestions: 'Попробуйте изменить параметр show_only или выбрать другой сценарий'
        });
      }
      
      // 🔄 Перемешиваем фильмы для разнообразия
      const shuffledMovies = this.shuffleArray(filteredMovies);
      
      // Форматирование результата
      const recommendations = this.formatMovies(shuffledMovies);
      
      // Генерируем уникальный ID запроса для отслеживания
      const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      
      // Сохраняем запрос в историю (асинхронно, не блокируем ответ)
      if (database.isConnected) {
        database.saveRequest({
          userId: userId,
          with_whom: scenario.with_whom,
          when_time: scenario.when_time,
          purpose: scenario.purpose,
          show_only: scenario.show_only,
          movies_count: recommendations.length
        }).then(result => {
          if (result.success) {
            console.log(`💾 Запрос сохранен в историю, ID: ${result.id}`);
          }
        }).catch(err => {
          console.error('❌ Не удалось сохранить запрос:', err);
        });
      }
      
      // Если пользователь авторизован, можем предложить сохранить фильм как просмотренный
      const watchSuggestions = authenticatedUserId ? recommendations.slice(0, 3).map(movie => ({
        movie_id: movie.id,
        movie_title: movie.title,
        endpoint: `/api/recommendations/mark-watched`,
        method: 'POST',
        body: {
          movieId: movie.id,
          movieTitle: movie.title,
          moviePoster: movie.poster,
          rating: null,
          comment: null
        }
      })) : [];
      
      // Возвращаем результат
      res.json({
        success: true,
        scenario: scenario,
        recommendations: recommendations.slice(0, 10),
        total: recommendations.length,
        metadata: {
          source: 'kinopoisk_api',
          genres: genres.russian,
          api_key_configured: true,
          database_connected: database.isConnected,
          request_id: requestId,
          shuffled: true, // Показываем, что результаты перемешаны
          timestamp: new Date().toISOString(),
          user_status: authenticatedUserId ? 'authenticated' : 'anonymous'
        },
        // Предложения для авторизованных пользователей
        ...(authenticatedUserId && {
          suggestions: {
            mark_as_watched: watchSuggestions,
            share_with_friends: {
              endpoint: '/api/friends/movies/share',
              method: 'POST'
            }
          }
        })
      });
      
    } catch (error) {
      console.error('❌ Ошибка в getRecommendations:', error.message);
      console.error('Stack trace:', error.stack);
      
      // Определяем тип ошибки для соответствующего статуса
      let statusCode = 400;
      let errorMessage = error.message;
      
      if (error.message.includes('Нужно указать') || error.message.includes('Недопустимое значение')) {
        statusCode = 400; // Bad Request
      } else if (error.message.includes('не настроен')) {
        statusCode = 500; // Internal Server Error
        errorMessage = 'Сервис временно недоступен. Ошибка конфигурации.';
      }
      
      res.status(statusCode).json({
        success: false,
        error: errorMessage,
        options: VALID_OPTIONS,
        help: 'Используйте GET /api/recommendations/options для списка допустимых значений',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Метод для получения допустимых значений
  async getValidOptions(req, res) {
    res.json({
      success: true,
      options: VALID_OPTIONS,
      genreMap: GENRE_MAP,
      description: 'Допустимые значения параметров для запроса рекомендаций'
    });
  }

  // История запросов (реальная из БД)
  async getHistory(req, res) {
    try {
      const userId = req.headers['x-user-id'] || 'anonymous';
      const authenticatedUserId = req.userId || userId;
      const limit = parseInt(req.query.limit) || 10;
      
      const result = await database.getHistory(authenticatedUserId, limit);
      
      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          total: result.data.length,
          user_id: authenticatedUserId,
          database_connected: database.isConnected
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Не удалось получить историю запросов',
          database_connected: database.isConnected,
          message: 'Проверьте подключение к базе данных'
        });
      }
    } catch (error) {
      console.error('❌ Ошибка получения истории:', error);
      res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера',
        database_connected: database.isConnected
      });
    }
  }

  // Статистика (реальная из БД)
  async getStats(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;
      
      const result = await database.getStats(days);
      
      if (result.success) {
        res.json({
          success: true,
          stats: result.stats,
          period_days: days,
          database_connected: database.isConnected,
          system: {
            version: "3.0.0",
            environment: process.env.NODE_ENV || "development",
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
          }
        });
      } else {
        res.json({
          success: true,
          stats: null,
          message: 'Статистика временно недоступна. База данных не подключена или таблицы не созданы.',
          database_connected: database.isConnected,
          help: 'Запустите миграции: npm run db:migrate'
        });
      }
    } catch (error) {
      console.error('❌ Ошибка получения статистики:', error);
      res.json({
        success: true,
        stats: null,
        message: 'Не удалось получить статистику',
        database_connected: database.isConnected
      });
    }
  }

  // Тест подключения к БД
  async testDatabase(req, res) {
    try {
      const result = await database.testConnection();
      
      // Проверяем существование таблиц
      const tablesResult = await database.pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      
      const tableList = tablesResult.rows.map(row => row.table_name);
      
      res.json({
        success: true,
        database: result,
        tables: {
          count: tableList.length,
          list: tableList
        },
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Отметить фильм как просмотренный (для системы друзей)
  async markAsWatched(req, res) {
    try {
      const userId = req.userId;
      const { movieId, movieTitle, moviePoster, rating, comment } = req.body;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Требуется аутентификация'
        });
      }
      
      if (!movieId || !movieTitle) {
        return res.status(400).json({
          success: false,
          error: 'Укажите movieId и movieTitle'
        });
      }
      
      // Проверяем существование таблицы user_watched_movies
      const tableExists = await database.pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'user_watched_movies'
        )
      `);
      
      if (!tableExists.rows[0].exists) {
        // Создаем таблицу если её нет
        await database.pool.query(`
          CREATE TABLE IF NOT EXISTS user_watched_movies (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            movie_id INTEGER NOT NULL,
            movie_title VARCHAR(255) NOT NULL,
            movie_poster TEXT,
            rating INTEGER CHECK (rating >= 1 AND rating <= 10),
            comment TEXT,
            watched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, movie_id)
          );
          CREATE INDEX IF NOT EXISTS idx_user_watched_movies_user_id ON user_watched_movies(user_id);
          CREATE INDEX IF NOT EXISTS idx_user_watched_movies_movie_id ON user_watched_movies(movie_id);
        `);
      }
      
      // Сохраняем просмотренный фильм
      const result = await this.saveWatchedMovie(userId, {
        id: movieId,
        title: movieTitle,
        poster: moviePoster
      }, rating, comment);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Фильм отмечен как просмотренный',
          movie: {
            movie_id: movieId,
            movie_title: movieTitle,
            movie_poster: moviePoster,
            rating: rating,
            comment: comment
          },
          can_share: {
            endpoint: '/api/friends/movies/share',
            method: 'POST',
            description: 'Поделиться просмотром с друзьями'
          }
        });
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error('❌ Ошибка отметки фильма как просмотренного:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка сохранения просмотренного фильма'
      });
    }
  }

  // Получить просмотренные фильмы пользователя
  async getWatchedMovies(req, res) {
    try {
      const userId = req.userId || req.query.userId;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Укажите userId'
        });
      }
      
      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;
      
      // Проверяем существование таблицы
      const tableExists = await database.pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'user_watched_movies'
        )
      `);
      
      if (!tableExists.rows[0].exists) {
        return res.json({
          success: true,
          movies: [],
          total: 0,
          message: 'Нет просмотренных фильмов'
        });
      }
      
      // Получаем просмотренные фильмы
      const result = await database.pool.query(`
        SELECT 
          movie_id,
          movie_title,
          movie_poster,
          rating,
          comment,
          watched_at
        FROM user_watched_movies
        WHERE user_id = $1
        ORDER BY watched_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);
      
      // Получаем общее количество
      const countResult = await database.pool.query(`
        SELECT COUNT(*) as total
        FROM user_watched_movies
        WHERE user_id = $1
      `, [userId]);
      
      res.json({
        success: true,
        movies: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: limit,
        offset: offset,
        user_id: userId
      });
      
    } catch (error) {
      console.error('❌ Ошибка получения просмотренных фильмов:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения просмотренных фильмов'
      });
    }
  }
}

// Экспорт singleton экземпляра
module.exports = new RecommendationsController();