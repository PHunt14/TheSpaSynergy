import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import '../styles/dashboard.css'

export default function DashboardLayout({ children }) {
  return (
    <div className="dashboard-wrapper">
      <Sidebar />
      <div className="dashboard-main">
        <Topbar />
        <div className="dashboard-content">
          {children}
        </div>
      </div>
    </div>
  )
}