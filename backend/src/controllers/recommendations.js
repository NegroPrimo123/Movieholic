// src/controllers/recommendations.js
const axios = require('axios');

// Константы для валидации и автодополнения
const VALID_OPTIONS = {
  WITH_WHOM: ['Один', 'С партнером (романтика)', 'С партнером (экшн)', 'С детьми', 'С друзьями (чтобы обсудить)', 'С друзьями (фоном)'],
  WHEN_TIME: ['Пятничный вечер', 'Воскресное утро', 'Ночью после работы', 'В отпуске'],
  PURPOSE: ['Отдохнуть мозгом', 'Вдохновиться', 'Пощекотать нервы', 'Порефлексировать'],
  SHOW_ONLY: ['малоизвестное', 'культовое', 'артхаус']
};

// Маппинг сценария на жанры
const GENRE_MAP = {
  'Один': ['драма', 'биография'],
  'С партнером (романтика)': ['мелодрама', 'комедия'],
  'С партнером (экшн)': ['боевик', 'триллер'],
  'С детьми': ['мультфильм', 'семейный'],
  'С друзьями (чтобы обсудить)': ['фантастика', 'детектив'],
  'С друзьями (фоном)': ['комедия', 'приключения']
};

const recommendationsController = {
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
  },

  // Получение жанров по сценарию
  getGenresByScenario(scenario) {
    return GENRE_MAP[scenario.with_whom] || ['драма'];
  },

  // Фильтрация фильмов
  filterMovies(movies, scenario) {
    let filteredMovies = movies;
    
    if (scenario.show_only === 'культовое') {
      filteredMovies = movies.filter(m => m.rating?.kp > 7.5);
    } else if (scenario.show_only === 'малоизвестное') {
      filteredMovies = movies.filter(m => !m.votes || m.votes.kp < 10000);
    } else if (scenario.show_only === 'артхаус') {
      filteredMovies = movies.filter(m => m.genres?.some(g => 
        g.name.toLowerCase().includes('артхаус') || 
        g.name.toLowerCase().includes('документальный') ||
        (m.votes?.kp < 5000 && m.rating?.kp > 7.0)
      ));
    }
    
    return filteredMovies;
  },

  // Форматирование фильмов
  formatMovies(movies) {
    return movies.map(movie => ({
      id: movie.id,
      title: movie.name,
      originalTitle: movie.alternativeName || movie.enName || '',
      year: movie.year,
      rating: movie.rating?.kp,
      genres: movie.genres?.map(g => g.name) || [],
      poster: movie.poster?.url || 'https://via.placeholder.com/300x450?text=No+Poster',
      description: movie.description ? 
        (movie.description.length > 150 ? movie.description.substring(0, 150) + '...' : movie.description) : 
        'Описание отсутствует'
    }));
  },

  // Получение фильмов из API
  async fetchMoviesFromAPI(genres) {
  const API_KEY = process.env.KINOPOISK_API_KEY || 'ES2DK6W-6NP4PD4-PJFHJWA-S7GV45H';
  const BASE_URL = 'https://api.kinopoisk.dev/v1.4';
  
  // Генерируем случайные параметры для разнообразия
  const randomPage = Math.floor(Math.random() * 5) + 1; // страницы 1-5
  const randomYearStart = Math.floor(Math.random() * 10) + 2010; // 2010-2020
  const randomYearEnd = randomYearStart + 5; // диапазон 5 лет
  
  const params = {
    'genres.name': genres,
    'rating.kp': '6-10',
    limit: 20,
    page: randomPage, // Добавляем случайную страницу
    'year': `${randomYearStart}-${randomYearEnd}`, // Добавляем случайный год
    selectFields: ['id', 'name', 'alternativeName', 'enName', 'year', 'rating', 'poster', 'genres', 'description', 'votes'],
    token: API_KEY
  };
  
  console.log(`🎲 Случайные параметры: страница ${randomPage}, год ${randomYearStart}-${randomYearEnd}`);
  
  try {
    const response = await axios.get(`${BASE_URL}/movie`, {
      params: params,
      headers: {
        'X-API-KEY': API_KEY
      },
      timeout: 10000
    });
    
    console.log(`✅ Получено ${response.data?.docs?.length || 0} фильмов от API`);
    return response.data.docs || [];
  } catch (apiError) {
    console.error('❌ Ошибка API:', apiError.message);
    return null;
  }
},

  // Основной метод получения рекомендаций
  getRecommendations: async (req, res) => {
    try {
      console.log('📥 Запрос рекомендаций:', req.body);
      
      const scenario = req.body;
      
      // Валидация
      recommendationsController.validateScenario(scenario);
      
      // Получаем жанры по сценарию
      const genres = recommendationsController.getGenresByScenario(scenario);
      console.log(`🎭 Выбранные жанры: ${genres.join(', ')}`);
      
      // Пытаемся получить фильмы из API
      let movies = await recommendationsController.fetchMoviesFromAPI(genres);
      
      // Если API недоступно, используем тестовые данные
      if (!movies || movies.length === 0) {
        console.log('⚠️ API недоступно или не вернуло данные, используем тестовые данные');
        movies = recommendationsController.getTestMovies();
      }
      
      // Фильтрация по дополнительным параметрам
      const filteredMovies = recommendationsController.filterMovies(movies, scenario);
      console.log(`🎬 После фильтрации: ${filteredMovies.length} фильмов`);
      
      // Форматирование результата
      const recommendations = recommendationsController.formatMovies(filteredMovies);
      
      // Возвращаем результат
      res.json({
        success: true,
        scenario: scenario,
        recommendations: recommendations.slice(0, 10),
        total: recommendations.length,
        metadata: {
          source: movies === recommendationsController.getTestMovies() ? 'test_data' : 'kinopoisk_api',
          genres: genres
        }
      });
      
    } catch (error) {
      console.error('❌ Ошибка в getRecommendations:', error.message);
      res.status(400).json({
        success: false,
        error: error.message,
        options: VALID_OPTIONS
      });
    }
  },

  // Метод для получения допустимых значений
  getValidOptions: (req, res) => {
    res.json({
      success: true,
      options: VALID_OPTIONS,
      genreMap: GENRE_MAP
    });
  },

  // Тестовые фильмы
  getTestMovies() {
    return [
      {
        id: 535341,
        name: "1+1",
        alternativeName: "Intouchables",
        year: 2011,
        rating: { kp: 8.8 },
        votes: { kp: 1123456 },
        genres: [{ name: "драма" }, { name: "комедия" }, { name: "биография" }],
        poster: { url: "https://st.kp.yandex.net/images/film_big/535341.jpg" },
        description: "Пострадав в результате несчастного случая, богатый аристократ Филипп нанимает в помощники человека, который менее всего подходит для этой работы..."
      },
      {
        id: 447301,
        name: "Начало",
        alternativeName: "Inception",
        year: 2010,
        rating: { kp: 8.7 },
        votes: { kp: 987654 },
        genres: [{ name: "фантастика" }, { name: "боевик" }, { name: "триллер" }],
        poster: { url: "https://st.kp.yandex.net/images/film_big/447301.jpg" },
        description: "Кобб — талантливый вор, лучший из лучших в опасном искусстве извлечения: он крадет ценные секреты из глубин подсознания во время сна..."
      },
      {
        id: 43395,
        name: "Темный рыцарь",
        alternativeName: "The Dark Knight",
        year: 2008,
        rating: { kp: 8.5 },
        votes: { kp: 1234567 },
        genres: [{ name: "фантастика" }, { name: "боевик" }, { name: "триллер" }, { name: "криминал" }],
        poster: { url: "https://st.kp.yandex.net/images/film_big/43395.jpg" },
        description: "Бэтмен поднимает ставки в войне с криминалом. С помощью лейтенанта Джима Гордона и прокурора Харви Дента он намерен очистить улицы от преступности..."
      },
      {
        id: 456,
        name: "Амели",
        alternativeName: "Le fabuleux destin d'Amélie Poulain",
        year: 2001,
        rating: { kp: 8.1 },
        votes: { kp: 234567 },
        genres: [{ name: "мелодрама" }, { name: "комедия" }],
        poster: { url: "https://st.kp.yandex.net/images/film_big/456.jpg" },
        description: "Амели — молодая женщина, работающая официанткой в кафе. Она находит старую жестяную коробку с детскими сокровищами..."
      },
      {
        id: 123,
        name: "Тайна Коко",
        alternativeName: "Coco",
        year: 2017,
        rating: { kp: 8.6 },
        votes: { kp: 345678 },
        genres: [{ name: "мультфильм" }, { name: "семейный" }, { name: "приключения" }],
        poster: { url: "https://st.kp.yandex.net/images/film_big/123.jpg" },
        description: "12-летний Мигель мечтает стать музыкантом, но его семья запрещает музыку. Он попадает в Страну Мертвых..."
      }
    ];
  },

  // История запросов
  getHistory: (req, res) => {
    res.json({
      success: true,
      data: [
        {
          id: 1,
          with_whom: "С друзьями (чтобы обсудить)",
          when_time: "Пятничный вечер",
          purpose: "Пощекотать нервы",
          movies_count: 3,
          created_at: "2024-01-15T20:30:00Z"
        },
        {
          id: 2,
          with_whom: "С партнером (романтика)",
          when_time: "Воскресное утро",
          purpose: "Вдохновиться",
          movies_count: 5,
          created_at: "2024-01-14T11:00:00Z"
        },
        {
          id: 3,
          with_whom: "Один",
          when_time: "Ночью после работы",
          purpose: "Отдохнуть мозгом",
          movies_count: 7,
          created_at: "2024-01-13T23:15:00Z"
        }
      ],
      total: 3
    });
  },

  // Статистика
  getStats: (req, res) => {
    res.json({
      success: true,
      stats: {
        api_status: "работает",
        recommendations_today: 42,
        recommendations_total: 1256,
        most_popular_scenario: "С друзьями (чтобы обсудить)",
        average_movies_per_request: 6.3,
        last_updated: new Date().toISOString()
      },
      system: {
        version: "1.0.0",
        environment: process.env.NODE_ENV || "development",
        uptime: process.uptime()
      }
    });
  }
};

// Экспорт
module.exports = recommendationsController;