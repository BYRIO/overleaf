import '@/marketing'
import { createRoot } from 'react-dom/client'
import ProjectList from '../components/project-list'

const element = document.getElementById('project-list-page-root')
if (element) {
  const root = createRoot(element)
  root.render(<ProjectList />)
}
