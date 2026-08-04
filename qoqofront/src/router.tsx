import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ContentPage } from './pages/app/ContentPage'
import { DashboardPage } from './pages/app/DashboardPage'
import { OrderDetailPage } from './pages/app/OrderDetailPage'
import { OrderFormPage } from './pages/app/OrderFormPage'
import { OrdersPage } from './pages/app/OrdersPage'
import { ReportsPage } from './pages/app/ReportsPage'
import { LogsPage } from './pages/app/LogsPage'
import { RoutePage } from './pages/app/RoutePage'
import { RoutesAdminPage } from './pages/app/RoutesAdminPage'
import { SettingsPage } from './pages/app/SettingsPage'
import { SettlementsPage } from './pages/app/SettlementsPage'
import { StockPage } from './pages/app/StockPage'
import { UsersPage } from './pages/app/UsersPage'
import { WarehousePage } from './pages/app/WarehousePage'
import { ReferenceListPage } from './pages/app/references/ReferenceListPage'
import { ReferencesIndexPage } from './pages/app/references/ReferencesIndexPage'
import { LandingPage } from './pages/public/LandingPage'
import { PrintPage } from './pages/print/PrintPage'
import { LoginPage } from './pages/public/LoginPage'
import { SetPasswordPage } from './pages/public/SetPasswordPage'

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/set-password', element: <SetPasswordPage /> },
  {
    // Печатные формы — без бокового меню и шапки: печатается документ, а не интерфейс.
    path: '/print/:kind/:id',
    element: (
      <ProtectedRoute>
        <PrintPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/app',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'orders', element: <OrdersPage /> },
      {
        path: 'orders/new',
        element: (
          <ProtectedRoute roles={['admin', 'director', 'sales_rep']}>
            <OrderFormPage />
          </ProtectedRoute>
        ),
      },
      { path: 'orders/:id', element: <OrderDetailPage /> },
      {
        path: 'orders/:id/edit',
        element: (
          <ProtectedRoute roles={['admin', 'director', 'sales_rep']}>
            <OrderFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'warehouse',
        element: (
          <ProtectedRoute roles={['admin', 'director', 'warehouse']}>
            <WarehousePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports',
        element: (
          <ProtectedRoute roles={['admin', 'director', 'accountant', 'sales_rep']}>
            <ReportsPage />
          </ProtectedRoute>
        ),
      },
      { path: 'route', element: <RoutePage /> },
      {
        path: 'routes',
        element: (
          <ProtectedRoute roles={['admin', 'director', 'accountant']}>
            <RoutesAdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settlements',
        element: (
          <ProtectedRoute roles={['admin', 'director', 'accountant']}>
            <SettlementsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'stock',
        element: (
          <ProtectedRoute roles={['admin', 'director', 'accountant', 'warehouse']}>
            <StockPage />
          </ProtectedRoute>
        ),
      },
      { path: 'refs', element: <ReferencesIndexPage /> },
      { path: 'refs/:resource', element: <ReferenceListPage /> },
      {
        path: 'users',
        element: (
          <ProtectedRoute roles={['admin']}>
            <UsersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'content',
        element: (
          <ProtectedRoute roles={['admin', 'director', 'accountant']}>
            <ContentPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'logs',
        element: (
          <ProtectedRoute roles={['admin']}>
            <LogsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute roles={['admin']}>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
