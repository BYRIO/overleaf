import '../utils/meta'
import '../utils/webpack-public-path'
import '../infrastructure/error-reporter'
import '@/i18n'
import { createRoot } from 'react-dom/client'
import UserRegister from '../features/register/components/user-register'

const element = document.getElementById('user-register-container')
if (element) {
  const root = createRoot(element)
  root.render(<UserRegister />)
}
