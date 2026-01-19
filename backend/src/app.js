const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

// Импорт маршрутов
const authRoutes = require('./routes/authRoutes');
const recommendationRoutes = require('./routes/recommendations');

const app = express();
const PORT = process.env.PORT || 3000;

// Опции для Swagger (обновленные с аутентификацией)
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '🎬 Movie Recommendation API',
      version: '2.0.0',
      description: 'API для получения рекомендаций фильмов с аутентификацией пользователей',
      contact: {
        name: 'Movie Recommendation Team',
        email: 'support@movierec.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server'
      },
      {
        url: 'https://api.movierec.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Введите JWT токен в формате: Bearer <token>'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com'
            },
            username: {
              type: 'string',
              example: 'movielover'
            },
            fullName: {
              type: 'string',
              example: 'Иван Иванов'
            },
            avatarUrl: {
              type: 'string',
              format: 'url',
              example: 'https://example.com/avatar.jpg'
            },
            isAdmin: {
              type: 'boolean',
              example: false
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-15T10:30:00Z'
            }
          }
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
            },
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
            },
            expiresIn: {
              type: 'string',
              example: '15m'
            }
          }
        },
        // Существующие схемы остаются...
        RecommendationRequest: {
          type: 'object',
          required: ['with_whom', 'when_time', 'purpose'],
          properties: {
            with_whom: {
              type: 'string',
              enum: ['Один', 'С партнером (романтика)', 'С партнером (экшн)', 'С детьми', 'С друзьями (чтобы обсудить)', 'С друзьями (фоном)'],
              example: 'С друзьями (чтобы обсудить)',
              description: 'С кем будете смотреть фильм'
            },
            when_time: {
              type: 'string',
              enum: ['Пятничный вечер', 'Воскресное утро', 'Ночью после работы', 'В отпуске'],
              example: 'Пятничный вечер',
              description: 'Когда планируете смотреть'
            },
            purpose: {
              type: 'string',
              enum: ['Отдохнуть мозгом', 'Вдохновиться', 'Пощекотать нервы', 'Порефлексировать'],
              example: 'Пощекотать нервы',
              description: 'Цель просмотра'
            },
            show_only: {
              type: 'string',
              enum: ['малоизвестное', 'культовое', 'артхаус'],
              example: 'культовое',
              description: 'Опционально: тип фильмов для показа'
            }
          }
        },
        Movie: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 535341
            },
            title: {
              type: 'string',
              example: '1+1'
            },
            originalTitle: {
              type: 'string',
              example: 'Intouchables'
            },
            year: {
              type: 'integer',
              example: 2011
            },
            rating: {
              type: 'number',
              format: 'float',
              example: 8.8
            },
            genres: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['драма', 'комедия']
            },
            poster: {
              type: 'string',
              example: 'https://st.kp.yandex.net/images/film_big/535341.jpg'
            },
            description: {
              type: 'string',
              example: 'Пострадав в результате несчастного случая, богатый аристократ...'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              example: 'Произошла ошибка'
            },
            errors: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['Некорректный email', 'Пароль слишком короткий']
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'Регистрация, вход и управление учетными записями'
      },
      {
        name: 'Recommendations',
        description: 'Операции с рекомендациями фильмов'
      },
      {
        name: 'User Profile',
        description: 'Управление профилем пользователя'
      },
      {
        name: 'History',
        description: 'История запросов'
      },
      {
        name: 'Statistics',
        description: 'Статистика работы сервиса'
      },
      {
        name: 'Admin',
        description: 'Административные операции'
      }
    ]
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware безопасности
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"]
    }
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID'],
  credentials: true
}));

// Лимитер запросов для аутентификации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // 10 запросов для аутентификации
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Слишком много попыток. Попробуйте позже.'
  }
});

// Лимитер для API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // 100 запросов с одного IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Слишком много запросов. Попробуйте позже.'
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Применяем лимитеры
app.use('/api/auth/', authLimiter);
app.use('/api/', apiLimiter);

// Маршруты
app.use('/api/auth', authRoutes);
app.use('/api/recommendations', recommendationRoutes);

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #e50914 }
    .swagger-ui .btn.authorize { background-color: #e50914 }
  `,
  customSiteTitle: '🎬 Movie Recommendation API Docs',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true
  }
}));

// Главная страница
app.get('/', (req, res) => {
  res.json({
    message: '🎬 Movie Recommendation API с аутентификацией',
    version: '2.0.0',
    documentation: '/api-docs',
    endpoints: {
      auth: {
        register: '/api/auth/register',
        login: '/api/auth/login',
        profile: '/api/auth/profile',
        refresh: '/api/auth/refresh'
      },
      recommendations: {
        getRecommendations: '/api/recommendations/recommend',
        history: '/api/recommendations/history',
        stats: '/api/recommendations/stats'
      },
      documentation: '/api-docs',
      health: '/health'
    },
    authentication: 'Используйте JWT токены для доступа к защищенным эндпоинтам'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: process.env.DATABASE_URL ? 'configured' : 'not_configured',
    auth: process.env.JWT_SECRET ? 'configured' : 'not_configured',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Обработка 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Маршрут не найден',
    path: req.path,
    method: req.method
  });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('❌ Ошибка сервера:', err.stack);
  
  const statusCode = err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(statusCode).json({
    success: false,
    error: isProduction ? 'Внутренняя ошибка сервера' : err.message,
    ...(err.errors && { errors: err.errors }),
    ...(!isProduction && { stack: err.stack })
  });
});

// Запуск сервера
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📚 Документация: http://localhost:${PORT}/api-docs`);
    console.log(`🔐 Аутентификация: http://localhost:${PORT}/api/auth/register`);
    console.log(`🎬 API: http://localhost:${PORT}/api/recommendations`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;