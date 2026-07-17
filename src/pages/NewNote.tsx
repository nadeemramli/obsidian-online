import { useSearchParams } from 'react-router-dom'
import { Editor } from '../components/Editor'

export default function NewNote() {
  const [sp] = useSearchParams()
  const title = sp.get('title') || ''
  return <Editor key={title} initialTitle={title} />
}
