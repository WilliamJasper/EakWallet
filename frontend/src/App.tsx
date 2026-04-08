import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import AdminPage from './pages/AdminPage'
import HrPage from './pages/HrPage'
import EmployeePage from './pages/EmployeePage'
import ForgotHrPasswordPage from './pages/ForgotHrPasswordPage'
import ResetHrPasswordPage from './pages/ResetHrPasswordPage'
import ResetEmployeePasswordPage from './pages/ResetEmployeePasswordPage'
import ForgotEmployeePasswordPage from './pages/ForgotEmployeePasswordPage'
import './styles/app.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthPage />}>
          <Route path="/login" element={null} />
          <Route path="/signup" element={null} />
          <Route
            path="/forgot-hr-password"
            element={<ForgotHrPasswordPage />}
          />
          <Route
            path="/reset-hr-password"
            element={<ResetHrPasswordPage />}
          />
          <Route
            path="/reset-employee-password"
            element={<ResetEmployeePasswordPage />}
          />
          <Route
            path="/forgot-employee-password"
            element={<ForgotEmployeePasswordPage />}
          />
        </Route>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/hr/*" element={<HrPage />} />
        <Route path="/employee/*" element={<EmployeePage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
