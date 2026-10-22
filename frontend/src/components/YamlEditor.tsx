import { yaml as yamlLang } from '@codemirror/lang-yaml'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'

const LABEL = EditorView.contentAttributes.of({ 'aria-label': 'Rules as YAML' })

export default function YamlEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <CodeMirror value={value} height="calc(100vh - 16rem)" extensions={[yamlLang(), LABEL]} onChange={onChange} basicSetup={{ lineNumbers: true, foldGutter: true }} />
}
