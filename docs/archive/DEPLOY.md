# 🚀 Деплой на Vercel

## Быстрый старт

### 1. Закоммитьте изменения
```bash
git add .
git commit -m "Deploy to Vercel"
git push origin main
```

### 2. Подключите к Vercel
1. Откройте https://vercel.com/new
2. Выберите репозиторий
3. Vercel автоматически определит настройки из `vercel.json`
4. Нажмите **Deploy**

## Конфигурация

Все настройки уже в `vercel.json`:
- ✅ Build Command: `npm run build`
- ✅ Output Directory: `dist`
- ✅ Framework: Vite
- ✅ SPA Rewrites: включены

## Проверка

После деплоя:
1. Откройте URL проекта
2. Проверьте консоль браузера (F12)
3. Убедитесь, что приложение загружается

## Если что-то не работает

### Ошибка сборки
```bash
# Проверьте локально
npm install
npm run build
```

### 404 на маршрутах
Проверьте `vercel.json` - должны быть `rewrites`

### Пустая страница
- Проверьте логи в Vercel Dashboard
- Убедитесь, что `dist/index.html` создан

## Логи

Vercel Dashboard → Deployments → Выберите деплой → Logs

## Поддержка

- [Vercel Docs](https://vercel.com/docs)
- [Vite Deploy Guide](https://vitejs.dev/guide/static-deploy)
