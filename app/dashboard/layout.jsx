import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import AuthLayout from './auth-layout'
import '../styles/dashboard.css'

export default function DashboardLayout({ children }) {
  return (
    <AuthLayout>
      <div className="dashboard-wrapper">
        <Sidebar />
        <div className="dashboard-main">
          <Topbar />
          <div className="dashboard-content">
            {children}
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}