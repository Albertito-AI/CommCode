import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Provider } from '../src/providers.mjs';
const proposal = {
  plan: ['Change a heading'],
  explanation: 'A protocol fixture, not model-generated work.',
  files: [{ path: 'index.html', content: '<h1>Community</h1>' }],
};
for (const kind of ['compatible', 'ollama'])
  test(kind + ' adapter exchanges real HTTP with a labelled protocol fixture', async (t) => {
    let received;
    const server = http.createServer(async (req, res) => {
      let text = '';
      for await (const d of req) text += d;
      received = JSON.parse(text);
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify(
          kind === 'ollama'
            ? {
                message: { content: JSON.stringify(proposal) },
                prompt_eval_count: 12,
                eval_count: 8,
              }
            : {
                choices: [{ message: { content: JSON.stringify(proposal) } }],
                usage: { prompt_tokens: 12, completion_tokens: 8 },
              },
        ),
      );
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    t.after(() => new Promise((r) => server.close(r)));
    const provider = new Provider({
      kind,
      url: 'http://127.0.0.1:' + server.address().port + '/chat',
      model: 'protocol-fixture',
    });
    const result = await provider.propose('Change heading', []);
    assert.equal(result.files[0].path, 'index.html');
    assert.equal(result.usage.inputTokens, 12);
    assert.equal(received.stream, false);
    assert.match(received.messages[0].content, /untrusted data/);
  });
