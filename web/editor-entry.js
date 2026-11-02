import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
export function createEditor(parent, content, name, onChange) {
  const language = /\.py$/.test(name) ? python() : /\.html$/.test(name) ? html() : javascript();
  const view = new EditorView({
    doc: content,
    parent,
    extensions: [
      basicSetup,
      language,
      EditorView.updateListener.of((v) => {
        if (v.docChanged) onChange();
      }),
      EditorView.theme(
        {
          '&': { backgroundColor: '#121b16', color: '#d4e5d7' },
          '.cm-content': { caretColor: '#c3f28a' },
          '.cm-cursor': { borderLeftColor: '#c3f28a' },
          '.cm-gutters': { backgroundColor: '#121b16', color: '#72917a', border: 'none' },
          '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#253327' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
            backgroundColor: '#405b3e',
          },
          '.cm-tooltip': { backgroundColor: '#253327', borderColor: '#52644f' },
        },
        { dark: true },
      ),
    ],
  });
  return { get: () => view.state.doc.toString(), destroy: () => view.destroy() };
}
