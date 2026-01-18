-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Таблица refresh токенов
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    device_info TEXT,
    ip_address INET,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT token_not_empty CHECK (token <> '')
);

-- Таблица для хранения истории запросов (обновленная)
CREATE TABLE IF NOT EXISTS recommendation_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    with_whom VARCHAR(50) NOT NULL,
    when_time VARCHAR(50) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    show_only VARCHAR(50),
    movies_count INTEGER NOT NULL DEFAULT 0,
    scenario_hash VARCHAR(64), -- Для предотвращения дублирования
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

-- Таблица избранных фильмов пользователей
CREATE TABLE IF NOT EXISTS user_favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    movie_id INTEGER NOT NULL,
    movie_title VARCHAR(255) NOT NULL,
    movie_poster TEXT,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, movie_id)
);

-- Таблица для кеширования популярных фильмов
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

-- Таблица для статистики (агрегированные данные для быстрого доступа)
CREATE TABLE IF NOT EXISTS daily_stats (
    date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
    total_requests INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    total_movies_recommended INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    
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

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_history_user_id ON recommendation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON recommendation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_scenario ON recommendation_history(with_whom, when_time, purpose);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_cached_movies_genres ON cached_movies USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_cached_movies_rating ON cached_movies(rating_kp DESC);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

-- Триггеры для обновления updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_stats_updated_at ON daily_stats;
CREATE TRIGGER update_daily_stats_updated_at 
    BEFORE UPDATE ON daily_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Представления для удобного доступа к данным
CREATE OR REPLACE VIEW vw_user_stats AS
SELECT 
    u.id,
    u.username,
    u.email,
    COUNT(DISTINCT rh.id) as total_requests,
    COUNT(DISTINCT uf.id) as total_favorites,
    MAX(rh.created_at) as last_request_date,
    MIN(u.created_at) as registration_date
FROM users u
LEFT JOIN recommendation_history rh ON u.id = rh.user_id
LEFT JOIN user_favorites uf ON u.id = uf.user_id
GROUP BY u.id, u.username, u.email;

CREATE OR REPLACE VIEW vw_recommendation_stats AS
SELECT 
    DATE_TRUNC('day', rh.created_at) as day,
    COUNT(*) as requests_count,
    COUNT(DISTINCT rh.user_id) as unique_users,
    SUM(rh.movies_count) as movies_recommended,
    AVG(rh.movies_count) as avg_movies_per_request,
    MODE() WITHIN GROUP (ORDER BY rh.with_whom) as most_popular_scenario,
    COUNT(CASE WHEN EXTRACT(HOUR FROM rh.created_at) BETWEEN 18 AND 23 THEN 1 END) as evening_requests,
    COUNT(CASE WHEN EXTRACT(HOUR FROM rh.created_at) BETWEEN 6 AND 11 THEN 1 END) as morning_requests
FROM recommendation_history rh
GROUP BY DATE_TRUNC('day', rh.created_at)
ORDER BY day DESC;

-- Функция для очистки старых данных
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $func$
BEGIN
    -- Очищаем историю старше 90 дней
    DELETE FROM recommendation_history 
    WHERE created_at < CURRENT_DATE - INTERVAL '90 days';
    
    -- Очищаем неактивные refresh токены
    DELETE FROM refresh_tokens 
    WHERE expires_at < CURRENT_TIMESTAMP 
       OR is_revoked = true;
    
    RAISE NOTICE 'Очистка старых данных выполнена';
END;
$func$ LANGUAGE plpgsql;

-- Создаем триггер для автоматического подсчета статистики
CREATE OR REPLACE FUNCTION update_daily_stats_on_request()
RETURNS TRIGGER AS $func$
BEGIN
    -- Обновляем daily_stats при новом запросе
    INSERT INTO daily_stats (date, total_requests, unique_users, total_movies_recommended)
    VALUES (CURRENT_DATE, 1, 1, NEW.movies_count)
    ON CONFLICT (date) DO UPDATE SET
        total_requests = daily_stats.total_requests + 1,
        total_movies_recommended = daily_stats.total_movies_recommended + NEW.movies_count,
        updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_stats ON recommendation_history;
CREATE TRIGGER trigger_update_stats
    AFTER INSERT ON recommendation_history
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_stats_on_request();

-- Комментарии к таблицам
COMMENT ON TABLE users IS 'Пользователи системы';
COMMENT ON TABLE refresh_tokens IS 'Refresh токены для аутентификации';
COMMENT ON TABLE recommendation_history IS 'История запросов рекомендаций фильмов';
COMMENT ON TABLE user_favorites IS 'Избранные фильмы пользователей';
COMMENT ON TABLE cached_movies IS 'Кешированные данные фильмов из API';
COMMENT ON TABLE daily_stats IS 'Ежедневная агрегированная статистика';

-- Создаем тестового пользователя (опционально)
INSERT INTO users (email, username, password_hash, full_name, is_admin)
VALUES (
    'admin@movierec.com', 
    'admin', 
    '$2a$10$YourHashedPasswordHere', -- Замените реальным хэшем
    'Администратор Системы',
    true
) ON CONFLICT (email) DO NOTHING;

-- Информационное сообщение
DO $info$
BEGIN
    RAISE NOTICE '✅ Таблицы с аутентификацией успешно созданы:';
    RAISE NOTICE '   - users';
    RAISE NOTICE '   - refresh_tokens';
    RAISE NOTICE '   - recommendation_history';
    RAISE NOTICE '   - user_favorites';
    RAISE NOTICE '   - cached_movies';
    RAISE NOTICE '   - daily_stats';
    RAISE NOTICE '✅ Индексы созданы';
    RAISE NOTICE '✅ Представления созданы';
    RAISE NOTICE '✅ Триггеры настроены';
    RAISE NOTICE '';
    RAISE NOTICE '💡 Дальнейшие действия:';
    RAISE NOTICE '   1. Проверьте таблицы: \dt';
    RAISE NOTICE '   2. Посмотрите пользователей: SELECT * FROM users;';
    RAISE NOTICE '   3. Запустите приложение и зарегистрируйтесь!';