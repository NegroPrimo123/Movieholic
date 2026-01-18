-- Миграция для создания таблиц Movie Recommendation API

-- Таблица для хранения истории запросов
CREATE TABLE IF NOT EXISTS recommendation_history (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL DEFAULT 'anonymous',
    with_whom VARCHAR(50) NOT NULL,
    when_time VARCHAR(50) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    show_only VARCHAR(50),
    movies_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Индексы для быстрого поиска
    CONSTRAINT valid_with_whom CHECK (
        with_whom IN (
            'Один', 
            'С партнером (романтика)', 
            'С партнером (экшн)', 
            'С детьми', 
            'С друзьями (чтобы обсудить)', 
            'С друзьями (фоном)'
        )
    ),
    CONSTRAINT valid_when_time CHECK (
        when_time IN (
            'Пятничный вечер', 
            'Воскресное утро', 
            'Ночью после работы', 
            'В отпуске'
        )
    ),
    CONSTRAINT valid_purpose CHECK (
        purpose IN (
            'Отдохнуть мозгом', 
            'Вдохновиться', 
            'Пощекотать нервы', 
            'Порефлексировать'
        )
    ),
    CONSTRAINT valid_show_only CHECK (
        show_only IS NULL OR show_only IN (
            'малоизвестное', 
            'культовое', 
            'артхаус'
        )
    )
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_history_user_id ON recommendation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON recommendation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_scenario ON recommendation_history(with_whom, when_time, purpose);

-- Таблица для кеширования популярных фильмов (опционально)
CREATE TABLE IF NOT EXISTS cached_movies (
    id INTEGER PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    original_title VARCHAR(255),
    year INTEGER,
    rating_kp DECIMAL(3,1),
    genres JSONB,
    poster_url TEXT,
    description TEXT,
    votes_kp INTEGER,
    source VARCHAR(50) DEFAULT 'kinopoisk',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_rating CHECK (rating_kp >= 0 AND rating_kp <= 10),
    CONSTRAINT valid_year CHECK (year >= 1900 AND year <= EXTRACT(YEAR FROM CURRENT_DATE) + 5)
);

CREATE INDEX IF NOT EXISTS idx_cached_movies_genres ON cached_movies USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_cached_movies_rating ON cached_movies(rating_kp DESC);

-- Таблица для статистики (агрегированные данные для быстрого доступа)
CREATE TABLE IF NOT EXISTS daily_stats (
    date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
    total_requests INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    total_movies_recommended INTEGER DEFAULT 0,
    
    -- Распределение по сценариям
    scenario_single INTEGER DEFAULT 0,
    scenario_partner_romance INTEGER DEFAULT 0,
    scenario_partner_action INTEGER DEFAULT 0,
    scenario_with_kids INTEGER DEFAULT 0,
    scenario_friends_discuss INTEGER DEFAULT 0,
    scenario_friends_background INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для daily_stats
CREATE TRIGGER update_daily_stats_updated_at 
    BEFORE UPDATE ON daily_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Представление для удобного доступа к статистике
CREATE OR REPLACE VIEW vw_recommendation_stats AS
SELECT 
    DATE_TRUNC('day', created_at) as day,
    COUNT(*) as requests_count,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(movies_count) as movies_recommended,
    AVG(movies_count) as avg_movies_per_request,
    
    -- Самый популярный сценарий за день
    MODE() WITHIN GROUP (ORDER BY with_whom) as most_popular_scenario,
    
    -- Распределение по времени суток (примерно)
    COUNT(CASE WHEN EXTRACT(HOUR FROM created_at) BETWEEN 18 AND 23 THEN 1 END) as evening_requests,
    COUNT(CASE WHEN EXTRACT(HOUR FROM created_at) BETWEEN 6 AND 11 THEN 1 END) as morning_requests
    
FROM recommendation_history
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

-- Функция для очистки старых данных (храним 90 дней)
CREATE OR REPLACE FUNCTION cleanup_old_history()
RETURNS void AS $$
BEGIN
    DELETE FROM recommendation_history 
    WHERE created_at < CURRENT_DATE - INTERVAL '90 days';
    
    RAISE NOTICE 'Очищена история старше 90 дней';
END;
$$ LANGUAGE plpgsql;

-- Комментарии к таблицам
COMMENT ON TABLE recommendation_history IS 'История запросов рекомендаций фильмов';
COMMENT ON TABLE cached_movies IS 'Кешированные данные фильмов из API';
COMMENT ON TABLE daily_stats IS 'Ежедневная агрегированная статистика';
COMMENT ON VIEW vw_recommendation_stats IS 'Представление для анализа статистики рекомендаций';

-- Выводим информацию о созданных объектах
DO $$
BEGIN
    RAISE NOTICE '✅ Таблицы успешно созданы:';
    RAISE NOTICE '   - recommendation_history';
    RAISE NOTICE '   - cached_movies (опционально)';
    RAISE NOTICE '   - daily_stats (опционально)';
    RAISE NOTICE '✅ Индексы созданы';
    RAISE NOTICE '✅ Представление vw_recommendation_stats создано';
    RAISE NOTICE '';
    RAISE NOTICE '💡 Дальнейшие действия:';
    RAISE NOTICE '   1. Проверьте таблицы: \dt';
    RAISE NOTICE '   2. Посмотрите статистику: SELECT * FROM vw_recommendation_stats LIMIT 7;';
    RAISE NOTICE '   3. Очистка старых данных: SELECT cleanup_old_history();';
END $$;