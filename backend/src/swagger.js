const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '🎬 Movie Recommendation API',
      version: '1.0.0',
      description: 'API для получения рекомендаций фильмов по сценарию просмотра',
      contact: {
        name: 'Movie Recommendation Team',
        email: 'support@movierec.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.movierec.com',
        description: 'Production server'
      }
    ],
    components: {
      schemas: {
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
              example: 'Нужно указать: с кем, когда и цель'
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Recommendations',
        description: 'Операции с рекомендациями фильмов'
      },
      {
        name: 'History',
        description: 'История запросов'
      },
      {
        name: 'Statistics',
        description: 'Статистика работы сервиса'
      }
    ]
  },
  apis: ['./routes/*.js', './app.js'] // Пути к файлам с JSDoc комментариями
};

const specs = swaggerJsdoc(options);

module.exports = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: '🎬 Movie Recommendation API Docs'
  }));
};