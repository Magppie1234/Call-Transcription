import './globals.css'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'

export const metadata = {
  title: 'Call Intelligence',
  description: 'Custom Dashboard for AI Transcribed Calls',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="layout-container">
          <Sidebar />
          <div className="main-content">
            <Header />
            {children}
          </div>
        </div>
      </body>
    </html>
  )
}
