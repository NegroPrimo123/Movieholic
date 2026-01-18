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

  // Получение фильмов из API Кинопоиска
  async fetchMoviesFromAPI(genres, scenario) {
    const API_KEY = process.env.KINOPOISK_API_KEY;
    
    if (!API_KEY) {
      console.warn('⚠️ API ключ Кинопоиска не найден');
      return null;
    }
    
    const BASE_URL = 'https://api.kinopoisk.dev/v1.4/movie';
    
    // Настройки запроса на основе show_only
    let params = {
      limit: 20,
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
      // Стандартные настройки
      params['rating.kp'] = '6.5-10';
      params.year = '2010-2024';
    }
    
    try {
      console.log(`📡 Запрос к API Кинопоиска с параметрами:`, {
        genres: genres.english,
        filters: scenario.show_only
      });
      
      const response = await axios.get(BASE_URL, {
        params: params,
        headers: {
          'X-API-KEY': API_KEY
        },
        timeout: 15000
      });
      
      const movies = response.data?.docs || [];
      console.log(`✅ Получено ${movies.length} фильмов от API Кинопоиска`);
      
      return movies;
    } catch (apiError) {
      console.error('❌ Ошибка API Кинопоиска:', {
        message: apiError.message,
        status: apiError.response?.status,
        data: apiError.response?.data
      });
      return null;
    }
  }

  // Получение резервных фильмов (из кеша или статических данных)
  async getFallbackMovies(genres) {
    console.log('🔄 Используем резервные данные');
    
    // Здесь можно добавить чтение из кеш-файла
    // или использовать небольшую локальную базу популярных фильмов
    
    const fallbackMovies = [
      {
        id: 535341,
        name: "1+1",
        alternativeName: "Intouchables",
        enName: "The Intouchables",
        year: 2011,
        rating: { kp: 8.8, imdb: 8.5 },
        poster: { 
          url: "https://st.kp.yandex.net/images/film_big/535341.jpg",
          previewUrl: "https://st.kp.yandex.net/images/film_iphone/iphone360_535341.jpg"
        },
        genres: [{ name: "драма" }, { name: "комедия" }, { name: "биография" }],
        description: "Пострадав в результате несчастного случая, богатый аристократ Филипп нанимает в помощники человека, который менее всего подходит для этой работы — молодого жителя предместья Дрисса, только что освободившегося из тюрьмы.",
        votes: { kp: 1739467 }
      },
      {
        id: 462682,
        name: "Волк с Уолл-стрит",
        alternativeName: "The Wolf of Wall Street",
        enName: "The Wolf of Wall Street",
        year: 2013,
        rating: { kp: 7.9, imdb: 8.2 },
        poster: { 
          url: "https://st.kp.yandex.net/images/film_big/462682.jpg",
          previewUrl: "https://st.kp.yandex.net/images/film_iphone/iphone360_462682.jpg"
        },
        genres: [{ name: "драма" }, { name: "комедия" }, { name: "биография" }],
        description: "1987 год. Джордан Белфорт становится брокером в успешном инвестиционном банке. Вскоре банк закрывается после внезапного обвала индекса Доу-Джонса.",
        votes: { kp: 1257345 }
      },
      {
        id: 301,
        name: "Матрица",
        alternativeName: "The Matrix",
        enName: "The Matrix",
        year: 1999,
        rating: { kp: 8.5, imdb: 8.7 },
        poster: { 
          url: "https://st.kp.yandex.net/images/film_big/301.jpg",
          previewUrl: "https://st.kp.yandex.net/images/film_iphone/iphone360_301.jpg"
        },
        genres: [{ name: "фантастика" }, { name: "боевик" }],
        description: "Жизнь Томаса Андерсона разделена на две части: днём он — самый обычный офисный работник, получающий нагоняи от начальства, а ночью превращается в хакера по имени Нео.",
        votes: { kp: 987654 }
      },
      {
        id: 435,
        name: "Зеленая миля",
        alternativeName: "The Green Mile",
        enName: "The Green Mile",
        year: 1999,
        rating: { kp: 9.1, imdb: 8.6 },
        poster: { 
          url: "https://st.kp.yandex.net/images/film_big/435.jpg",
          previewUrl: "https://st.kp.yandex.net/images/film_iphone/iphone360_435.jpg"
        },
        genres: [{ name: "драма" }, { name: "фэнтези" }, { name: "криминал" }],
        description: "Пол Эджкомб — начальник блока смертников в тюрьме «Холодная гора», каждый из узников которого однажды проходит «зеленую милю» по пути к месту казни.",
        votes: { kp: 876543 }
      },
      {
        id: 448,
        name: "Форрест Гамп",
        alternativeName: "Forrest Gump",
        enName: "Forrest Gump",
        year: 1994,
        rating: { kp: 8.9, imdb: 8.8 },
        poster: { 
          url: "https://st.kp.yandex.net/images/film_big/448.jpg",
          previewUrl: "https://st.kp.yandex.net/images/film_iphone/iphone360_448.jpg"
        },
        genres: [{ name: "драма" }, { name: "комедия" }, { name: "мелодрама" }],
        description: "Сидя на автобусной остановке, Форрест Гамп — не очень умный, но добрый и открытый парень — рассказывает случайным встречным историю своей необыкновенной жизни.",
        votes: { kp: 765432 }
      }
    ];
    
    // Фильтрация по жанрам (если указаны)
    let filteredMovies = fallbackMovies;
    if (genres.russian.length > 0) {
      filteredMovies = fallbackMovies.filter(movie => 
        movie.genres.some(genre => 
          genres.russian.some(g => 
            genre.name.toLowerCase().includes(g.toLowerCase())
          )
        )
      );
    }
    
    // Ограничиваем количество
    return filteredMovies.slice(0, 10);
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

  // Основной метод получения рекомендаций
  async getRecommendations(req, res) {
    try {
      console.log('📥 Запрос рекомендаций:', req.body);
      
      const scenario = req.body;
      const userId = req.headers['x-user-id'] || 'anonymous';
      
      // Валидация
      this.validateScenario(scenario);
      
      // Получаем жанры по сценарию
      const genres = this.getGenresByScenario(scenario);
      console.log(`🎭 Выбранные жанры: ${genres.russian.join(', ')}`);
      
      // Пытаемся получить фильмы из API
      let movies = await this.fetchMoviesFromAPI(genres, scenario);
      let source = 'kinopoisk_api';
      
      // Если API недоступно, используем резервные данные
      if (!movies || movies.length === 0) {
        console.log('⚠️ API недоступно, используем резервные данные');
        movies = await this.getFallbackMovies(genres);
        source = 'fallback_data';
      }
      
      // Фильтрация по дополнительным параметрам
      const filteredMovies = this.filterMovies(movies, scenario);
      console.log(`🎬 После фильтрации: ${filteredMovies.length} фильмов`);
      
      // Форматирование результата
      const recommendations = this.formatMovies(filteredMovies);
      
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
      
      // Возвращаем результат
      res.json({
        success: true,
        scenario: scenario,
        recommendations: recommendations.slice(0, 10),
        total: recommendations.length,
        metadata: {
          source: source,
          genres: genres.russian,
          api_key_configured: !!process.env.KINOPOISK_API_KEY,
          database_connected: database.isConnected
        }
      });
      
    } catch (error) {
      console.error('❌ Ошибка в getRecommendations:', error.message);
      res.status(400).json({
        success: false,
        error: error.message,
        options: VALID_OPTIONS,
        help: 'Используйте GET /api/recommendations/options для списка допустимых значений'
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
      const limit = parseInt(req.query.limit) || 10;
      
      const result = await database.getHistory(userId, limit);
      
      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          total: result.data.length,
          user_id: userId,
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
            version: "1.0.0",
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
      
      res.json({
        success: true,
        database: result,
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
}

// Экспорт singleton экземпляра
module.exports = new RecommendationsController();