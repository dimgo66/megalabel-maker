# Деплой на Vercel

## Проблема

Vercel не смог задеплоить проект с GitHub из-за отсутствия конфигурации.

## Решение

Создан файл `vercel.json` с правильными настройками для Vite проекта.

## Конфигурация vercel.json

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

### Объяснение параметров:

- **buildCommand**: `npm run build` - команда для сборки проекта
- **outputDirectory**: `dist` - директория с собранными файлами (Vite по умолчанию использует `dist`)
- **devCommand**: `npm run dev` - команда для локальной разработки
- **installCommand**: `npm install` - команда установки зависимостей
- **framework**: `vite` - указываем фреймворк для оптимизации
- **rewrites**: перенаправление всех маршрутов на `index.html` для SPA (Single Page Application)
- **headers**: кэширование статических ассетов на 1 год (immutable)

## Инструкции по деплою

### Способ 1: Через Vercel Dashboard

1. **Подключите GitHub репозиторий**
   - Зайдите на https://vercel.com
   - Нажмите "Add New Project"
   - Выберите ваш GitHub репозиторий

2. **Vercel автоматически определит настройки**
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Нажмите "Deploy"**
   - Vercel установит зависимости
   - Соберёт проект
   - Задеплоит на продакшн

### Способ 2: Через Vercel CLI

```bash
# Установите Vercel CLI
npm i -g vercel

# Войдите в аккаунт
vercel login

# Задеплойте проект
vercel

# Для продакшн деплоя
vercel --prod
```

### Способ 3: Автоматический деплой при push

После подключения репозитория к Vercel:
- Каждый push в main/master ветку автоматически запускает деплой
- Vercel создаёт preview деплой для каждой ветки/PR

## Проверка локальной сборки

Перед деплоем убедитесь, что проект собирается локально:

```bash
# Установите зависимости
npm install

# Соберите проект
npm run build

# Проверьте директорию dist
ls -la dist/
```

Ожидаемая структура `dist/`:
```
dist/
├── index.html
└── assets/
    ├── index-*.js
    ├── index-*.css
    └── pdf.worker.min-*.mjs
```

## Возможные проблемы и решения

### 1. Ошибка: "Module not found"

**Причина**: Отсутствие зависимостей в package.json

**Решение**:
```bash
npm install
npm run build
```

### 2. Ошибка: "Build failed"

**Причина**: Ошибки TypeScript или неправильная конфигурация

**Решение**:
```bash
# Проверьте TypeScript
npm run typecheck

# Проверьте сборку
npm run build
```

### 3. Ошибка: "Page not found" после деплоя

**Причина**: Неправильный output directory

**Решение**: Убедитесь, что в vercel.json указано `"outputDirectory": "dist"`

### 4. Ошибка: "404 на всех маршрутах кроме /"

**Причина**: Отсутствие rewrites для SPA

**Решение**: Проверьте наличие rewrites в vercel.json:
```json
"rewrites": [
  { "source": "/(.*)", "destination": "/index.html" }
]
```

### 5. Ошибка: "Chunk load failed"

**Причина**: Проблемы с кэшированием или путями

**Решение**: Добавьте headers для кэширования в vercel.json

## Оптимизация для продакшна

### 1. Code Splitting

Проект уже использует динамические импорты:
```typescript
const { exportToVectorPDF } = await import('./vectorExporter');
```

### 2. Compression

Vercel автоматически сжимает файлы gzip/brotli.

### 3. CDN

Все статические ассеты кэшируются на CDN Vercel.

### 4. Environment Variables

Если нужны переменные окружения:

```bash
# В Vercel Dashboard
Settings → Environment Variables → Add

# Или через CLI
vercel env add VITE_API_URL
```

Доступ в коде:
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

## Мониторинг после деплоя

### Analytics

Vercel предоставляет встроенную аналитику:
- Analytics → Web Vitals
- Analytics → Audience

### Logs

Просмотр логов сборки и runtime:
- Deployments → Select deployment → Logs

### Performance

Проверка производительности:
- Analytics → Web Vitals
- Lighthouse в Chrome DevTools

## Обновление проекта

После внесения изменений:

```bash
# Закоммитьте изменения
git add .
git commit -m "Fix: исправлена проблема с деплоем"

# Запушьте в GitHub
git push origin main

# Vercel автоматически задеплоит
```

## Откат деплоя

Если новый деплой содержит ошибки:

1. Зайдите в Vercel Dashboard
2. Перейдите в Deployments
3. Найдите предыдущий успешный деплой
4. Нажмите "Promote to Production"

## Дополнительные ресурсы

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [Vercel CLI](https://vercel.com/docs/cli)

## Поддержка

Если проблема не решена:

1. Проверьте логи деплоя в Vercel Dashboard
2. Попробуйте деплой через Vercel CLI для более подробных ошибок
3. Убедитесь, что все зависимости установлены
4. Проверьте версию Node.js (рекомендуется 18+)

## Чеклист перед деплоем

- [ ] Проект собирается локально (`npm run build`)
- [ ] Директория `dist` создана и содержит файлы
- [ ] Файл `vercel.json` добавлен в репозиторий
- [ ] Все изменения закоммичены и запушены в GitHub
- [ ] Репозиторий подключён к Vercel
- [ ] Настройки деплоя соответствуют vercel.json
