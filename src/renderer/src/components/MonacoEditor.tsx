import Editor, { loader, type OnChange } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Use the bundled Monaco runtime rather than the loader's CDN default.
loader.config({ monaco })

interface MonacoInstance {
  editor: {
    defineTheme(name: string, theme: unknown): void
    setTheme(name: string): void
  }
}

interface MonacoEditorProps {
  value: string
  onChange?: (value: string) => void
  fileName: string
  readOnly?: boolean
}

function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'py':
      return 'python'
    case 'rs':
      return 'rust'
    case 'go':
      return 'go'
    case 'java':
      return 'java'
    case 'c':
    case 'h':
      return 'c'
    case 'cpp':
    case 'cc':
    case 'hpp':
      return 'cpp'
    case 'cs':
      return 'csharp'
    case 'html':
    case 'htm':
      return 'html'
    case 'css':
      return 'css'
    case 'scss':
      return 'scss'
    case 'json':
      return 'json'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'md':
    case 'mdx':
      return 'markdown'
    case 'sql':
      return 'sql'
    case 'sh':
    case 'bash':
      return 'shell'
    case 'xml':
      return 'xml'
    default:
      return 'plaintext'
  }
}

function handleBeforeMount(monaco: MonacoInstance) {
  monaco.editor.defineTheme('kadris-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c586c0' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'type', foreground: '4ec9b0' },
      { token: 'function', foreground: 'dcdcaa' },
      { token: 'variable', foreground: '9cdcfe' },
      { token: 'operator', foreground: 'd4d4d4' },
    ],
    colors: {
      'editor.background': '#111318',
      'editor.foreground': '#d8dbe2',
      'editorLineNumber.foreground': '#555b69',
      'editorLineNumber.activeForeground': '#d8dbe2',
      'editor.selectionBackground': '#3a465c',
      'editor.lineHighlightBackground': '#1a1d24',
      'editorCursor.foreground': '#e17b3d',
      'editor.inactiveSelectionBackground': '#2a3244',
      'editorIndentGuide.background': '#2a2d35',
      'editorIndentGuide.activeBackground': '#444a56',
      'editorWidget.background': '#1a1d23',
      'editorSuggestWidget.background': '#1a1d23',
      'editorSuggestWidget.border': '#3b3f49',
      'editorSuggestWidget.selectedBackground': '#293346',
      'input.background': '#111318',
      'input.border': '#3b3f49',
      'focusBorder': '#5294e2',
    }
  })
  monaco.editor.setTheme('kadris-dark')
}

export default function MonacoEditor({ value, onChange, fileName, readOnly = false }: MonacoEditorProps) {
  const language = getLanguageFromFileName(fileName)

  const handleChange: OnChange = (val) => {
    onChange?.(val ?? '')
  }

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={handleChange}
      theme="kadris-dark"
      beforeMount={handleBeforeMount}
      options={{
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        minimap: { enabled: true, scale: 1 },
        scrollBeyondLastLine: false,
        readOnly,
        wordWrap: 'on',
        lineNumbers: 'on',
        renderLineHighlight: 'all',
        bracketPairColorization: { enabled: true },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        automaticLayout: true,
        padding: { top: 10 },
        suggestOnTriggerCharacters: true,
        tabSize: 2,
      }}
    />
  )
}
