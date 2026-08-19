const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizePromptedSlackMentions } = require('../src/slackFormatting');

test('normalizes prompted Slack broadcast mentions', () => {
  const prompt = 'Write “at channel” as “@channel” and “at here” as “@here”.';
  const text = 'At channel, the deploy is done. Please tell at here too.';

  assert.equal(
    normalizePromptedSlackMentions(text, prompt),
    '@channel, the deploy is done. Please tell @here too.'
  );
});

test('normalizes only the broadcast mentions requested by the prompt', () => {
  assert.equal(
    normalizePromptedSlackMentions('at channel and at here', 'Use @channel.'),
    '@channel and at here'
  );
});

test('leaves ordinary transcripts and member names unchanged', () => {
  const text = 'Please ask at Johan and post in hash general.';

  assert.equal(normalizePromptedSlackMentions(text), text);
  assert.equal(normalizePromptedSlackMentions(text, 'Use @channel and @here.'), text);
});
