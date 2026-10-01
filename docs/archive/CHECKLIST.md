# 📋 Чеклист перед деплоем на Vercel

## ✅ Файлы в корне проекта

- [ ] `vercel.json` - конфигурация Vercel
- [ ] `.vercelignore` - исключения для деплоя
- [ ] `.vercel/project.json` - дополнительные настройки
- [ ] `package.json` - зависимости и скрипты
- [ ] `vite.config.js` - конфигурация Vite
- [ ] `tsconfig.json` - конфигурация TypeScript
- [ ] `index.html` - точка входа
- [ ] `README.md` - документация
- [ ] `DEPLOY.md` - инструкция по деплою
- [ ] `VERCEL_READY.md` - статус готовности
- [ ] `.gitattributes` - настройки git

## ✅ Локальная проверка

```bash
# 1. Установите зависимости
npm install

# 2. Проверьте типы
npm run typecheck

# 3. Соберите проект
npm run build

# 4. Проверьте директорию dist
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

## ✅ Git статус

```bash
# Проверьте статус
git status

# Все изменения должны быть закоммичены
git add .
git commit -m "Prepare for Vercel deployment"

# Запушьте в GitHub
git push origin main
```

## ✅ Vercel настройки

### Автоматическое определение
Vercel должен автоматически определить:
- Framework: **Vite**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

### Ручная настройка (если нужно)
Vercel Dashboard → Settings → General:
- Framework Preset: **Vite**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## ✅ Деплой

### Через Vercel Dashboard
1. Откройте https://vercel.com/new
2. Import Git Repository
3. Выберите репозиторий
4. Нажмите **Deploy**
5. Дождитесь завершения

### Через Vercel CLI
```bash
# Установите CLI
npm i -g vercel

# Войдите
vercel login

# Задеплойте
vercel

# Продакшн деплой
vercel --prod
```

## ✅ После деплоя

### Проверка
- [ ] Откройте URL проекта
- [ ] Проверьте консоль браузера (F12)
- [ ] Нет ошибок JavaScript
- [ ] Все функции работают

### Тестирование функций
- [ ] Создание этикетки
- [ ] Добавление текста
- [ ] Загрузка изображений
- [ ] Генерация штрих-кодов
- [ ] Экспорт в PDF
- [ ] Печать

### Мониторинг
- [ ] Vercel Dashboard → Analytics
- [ ] Проверьте Web Vitals
- [ ] Проверьте логи деплоя

## ❌ Если что-то не работает

### Ошибка: "Module not found"
```bash
npm install
npm run build
```

### Ошибка: "Build failed"
Проверьте логи в Vercel Dashboard → Deployments → Logs

### Ошибка: "Page not found"
Убедитесь, что в `vercel.json` есть:
```json
"rewrites": [
  { "source": "/(.*)", "destination": "/index.html" }
]
```

### Ошибка: "404 на маршрутах"
Проверьте `vercel.json` - должны быть `rewrites`

### Ошибка: "Chunk load failed"
Очистите кэш браузера (Ctrl+Shift+R)

## 📞 Поддержка

- [Vercel Docs](https://vercel.com/docs)
- [Vite Deploy Guide](https://vitejs.dev/guide/static-deploy.html)
- [DEPLOY.md](./DEPLOY.md) - подробная инструкция
- [VERCEL_READY.md](./VERCEL_READY.md) - статус готовности

---

**Статус:** ✅ Все файлы на месте, проект готов к деплою!

**Следующий шаг:** Закоммитьте изменения и запушьте в GitHub, затем подключите репозиторий к Vercel.
