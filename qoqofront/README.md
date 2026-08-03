# qoqofront

Фронтенд на React + Material UI.

## Стек

- React 19, TypeScript, Vite
- Material UI v9 (@mui/material, @mui/icons-material)
- TanStack Query — работа с API
- React Router — маршрутизация
- React Hook Form + zod — формы и валидация
- axios — HTTP-клиент
- oxlint — линтер

## Запуск

```bash
npm install
npm run dev
```

Откроется http://localhost:5173. Запросы на `/api` Vite проксирует на
`http://localhost:8000`, поэтому бэкенд должен быть запущен параллельно, а
`VITE_API_URL` в разработке можно оставить пустым.

## Команды

```bash
npm run build     # проверка типов + продакшен-сборка
npm run lint      # oxlint
npm run preview   # локальный просмотр собранной версии
```

## Структура

| Путь | Назначение |
| --- | --- |
| `src/App.tsx` | Провайдеры: тема, CssBaseline, TanStack Query, роутер |
| `src/router.tsx` | Описание маршрутов |
| `src/theme.ts` | Тема MUI (светлая и тёмная схемы) |
| `src/api/client.ts` | Экземпляр axios с базовым адресом API |
| `src/api/` | Хуки запросов к API |
| `src/components/` | Переиспользуемые компоненты и layout |
| `src/pages/` | Страницы |
